import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiToken, getApiUrl } from "../../../api/config";
import {
  concatFloat32Arrays,
  downsampleFloat32,
  float32ToBase64,
  TARGET_CHUNK_SIZE,
  TARGET_SAMPLE_RATE,
} from "./audioUtils";
import type {
  VoiceSecretaryAudioPayload,
  VoiceSecretaryResult,
  VoiceSecretaryStreamAudioChunk,
  VoiceSecretaryStreamAudioStart,
  VoiceSecretaryStatus,
  VoiceSecretaryTurnState,
} from "./types";

interface UseVoiceSecretaryOptions {
  enabled: boolean;
  userId: string;
  userName?: string;
}

const buildVoiceSecretaryWsUrl = (userId: string) => {
  const token = getApiToken();
  const apiUrl = getApiUrl("/");
  const baseUrl = apiUrl.replace(/\/api\/?$/, "") || window.location.origin;
  const url = new URL(`/api/voice-secretary/ws/${encodeURIComponent(userId)}`, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
};

const getTurnPreviewText = (turnState?: VoiceSecretaryTurnState | null) =>
  String(turnState?.text || turnState?.asr_buffer || turnState?.asr_segment || "").trim();

const base64ToUint8Array = (input: string) => {
  const normalized = String(input || "").replace(/\s+/g, "");
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const SPEECH_CAPTURE_COOLDOWN_MS = 600;
const AUDIO_PLAYBACK_WATCHDOG_MS = 15000;
const AUTO_SLEEP_MS = 30_000;

export function useVoiceSecretary({ enabled, userId }: UseVoiceSecretaryOptions) {
  const supported = useMemo(
    () => typeof window !== "undefined" && Boolean(window.WebSocket && navigator.mediaDevices?.getUserMedia),
    [],
  );
  const browserSpeechSupported = useMemo(
    () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    [],
  );

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sinkGainRef = useRef<GainNode | null>(null);
  const pendingBufferRef = useRef<Float32Array>(new Float32Array());
  const manualCloseRef = useRef(false);
  const startInFlightRef = useRef(false);
  const statusRef = useRef<VoiceSecretaryStatus>("idle");
  const capturePausedUntilRef = useRef(0);
  const lastAssistantResultKeyRef = useRef("");
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const audioPlaybackUrlRef = useRef<string>("");
  const audioPlaybackTimerRef = useRef<number | null>(null);
  // 流式 PCM 播放器
  const streamAudioCtxRef = useRef<AudioContext | null>(null);
  const streamSampleRateRef = useRef(48000);
  const streamNextTimeRef = useRef(0);
  const streamActiveReqIdRef = useRef("");
  // 记录流式音频首块到达时间，用于计算总播放时长
  const streamStartTimeRef = useRef(0);

  // ★ 激活状态控制：待命态不发音频，激活态正常拾音
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const autoSleepTimerRef = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<VoiceSecretaryStatus>("idle");
  const [statusText, setStatusText] = useState("语音秘书待命中");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [transcript, setTranscript] = useState("");
  const [lastTurnState, setLastTurnState] = useState<VoiceSecretaryTurnState | null>(null);
  const [lastResult, setLastResult] = useState<VoiceSecretaryResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!browserSpeechSupported) {
      return undefined;
    }
    const primeVoices = () => {
      window.speechSynthesis.getVoices();
    };
    primeVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", primeVoices);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", primeVoices);
  }, [browserSpeechSupported]);

  const clearAutoSleepTimer = useCallback(() => {
    if (autoSleepTimerRef.current) {
      window.clearTimeout(autoSleepTimerRef.current);
      autoSleepTimerRef.current = null;
    }
  }, []);

  const resetAutoSleepTimer = useCallback(() => {
    clearAutoSleepTimer();
    autoSleepTimerRef.current = window.setTimeout(() => {
      // 30秒无交互，自动休眠
      activeRef.current = false;
      setActive(false);
      pendingBufferRef.current = new Float32Array();
      setStatus("idle");
      setStatusText("语音秘书待命中（点击唤醒）");
    }, AUTO_SLEEP_MS);
  }, [clearAutoSleepTimer]);

  const activate = useCallback(() => {
    activeRef.current = true;
    setActive(true);
    setStatusText("语音秘书已激活，请说...");
    resetAutoSleepTimer();
  }, [resetAutoSleepTimer]);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    clearAutoSleepTimer();
    pendingBufferRef.current = new Float32Array();
    setStatus("idle");
    setStatusText("语音秘书待命中（点击唤醒）");
  }, [clearAutoSleepTimer]);

  const cancelSpeech = useCallback(() => {
    if (audioPlaybackTimerRef.current) {
      window.clearTimeout(audioPlaybackTimerRef.current);
      audioPlaybackTimerRef.current = null;
    }
    if (browserSpeechSupported) {
      window.speechSynthesis.cancel();
    }
    const activeAudio = audioPlaybackRef.current;
    if (activeAudio) {
      activeAudio.onplay = null;
      activeAudio.onended = null;
      activeAudio.onerror = null;
      try {
        activeAudio.pause();
      } catch {
        // noop
      }
      activeAudio.src = "";
      audioPlaybackRef.current = null;
    }
    if (audioPlaybackUrlRef.current) {
      URL.revokeObjectURL(audioPlaybackUrlRef.current);
      audioPlaybackUrlRef.current = "";
    }
    // 清理流式播放器
    streamActiveReqIdRef.current = "";
    const ctx = streamAudioCtxRef.current;
    if (ctx) {
      try { ctx.close(); } catch { /* noop */ }
      streamAudioCtxRef.current = null;
    }
  }, [browserSpeechSupported]);

  const disconnectInternal = useCallback(async () => {
    cancelSpeech();
    pendingBufferRef.current = new Float32Array();
    startInFlightRef.current = false;
    capturePausedUntilRef.current = 0;
    lastAssistantResultKeyRef.current = "";

    const processor = processorRef.current;
    if (processor) {
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
      } catch {
        // noop
      }
      processorRef.current = null;
    }

    const sourceNode = sourceNodeRef.current;
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {
        // noop
      }
      sourceNodeRef.current = null;
    }

    const gainNode = sinkGainRef.current;
    if (gainNode) {
      try {
        gainNode.disconnect();
      } catch {
        // noop
      }
      sinkGainRef.current = null;
    }

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const audioContext = audioContextRef.current;
    if (audioContext) {
      await audioContext.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    }
  }, [cancelSpeech]);

  const speakText = useCallback(
    (value: string) => {
      const text = String(value || "").trim();
      if (!text || !browserSpeechSupported) {
        setStatus("idle");
        setStatusText("语音秘书待命中");
        return;
      }
      cancelSpeech();
      capturePausedUntilRef.current = Number.MAX_SAFE_INTEGER;
      pendingBufferRef.current = new Float32Array();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => {
        capturePausedUntilRef.current = Number.MAX_SAFE_INTEGER;
        pendingBufferRef.current = new Float32Array();
        setStatus("speaking");
        setStatusText("语音秘书正在播报结果...");
      };
      utterance.onend = () => {
        capturePausedUntilRef.current = Date.now() + SPEECH_CAPTURE_COOLDOWN_MS;
        pendingBufferRef.current = new Float32Array();
        setStatus("idle");
        setStatusText("语音秘书待命中");
      };
      utterance.onerror = () => {
        capturePausedUntilRef.current = Date.now() + SPEECH_CAPTURE_COOLDOWN_MS;
        pendingBufferRef.current = new Float32Array();
        setStatus("idle");
        setStatusText("语音秘书待命中");
      };
      window.speechSynthesis.speak(utterance);
    },
    [browserSpeechSupported, cancelSpeech],
  );

  const playAudioPayload = useCallback(
    (audioPayload: VoiceSecretaryAudioPayload | null | undefined, fallbackText: string) => {
      const audioBase64 = String(audioPayload?.data || "").trim();
      if (!audioBase64) {
        speakText(fallbackText);
        return;
      }
      const mimeType = String(audioPayload?.mimeType || audioPayload?.mime_type || "audio/mpeg").trim() || "audio/mpeg";
      try {
        cancelSpeech();
        capturePausedUntilRef.current = Number.MAX_SAFE_INTEGER;
        pendingBufferRef.current = new Float32Array();
        setStatus("speaking");
        setStatusText("语音秘书正在准备播报...");
        const audioBytes = base64ToUint8Array(audioBase64);
        const audioBlob = new Blob([audioBytes], { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioPlaybackUrlRef.current = audioUrl;
        const audio = new Audio(audioUrl);
        audio.preload = "auto";
        audioPlaybackRef.current = audio;
        let finalized = false;

        const finalizePlayback = () => {
          if (finalized) {
            return;
          }
          finalized = true;
          if (audioPlaybackTimerRef.current) {
            window.clearTimeout(audioPlaybackTimerRef.current);
            audioPlaybackTimerRef.current = null;
          }
          if (audioPlaybackRef.current === audio) {
            audioPlaybackRef.current = null;
          }
          if (audioPlaybackUrlRef.current === audioUrl) {
            URL.revokeObjectURL(audioUrl);
            audioPlaybackUrlRef.current = "";
          }
          capturePausedUntilRef.current = Date.now() + SPEECH_CAPTURE_COOLDOWN_MS;
          pendingBufferRef.current = new Float32Array();
          setStatus("idle");
          setStatusText("语音秘书待命中");
        };

        audioPlaybackTimerRef.current = window.setTimeout(() => {
          console.warn("[VoiceSecretary] audio playback watchdog timeout");
          finalizePlayback();
          if (fallbackText) {
            speakText(fallbackText);
          }
        }, AUDIO_PLAYBACK_WATCHDOG_MS);

        audio.onplay = () => {
          capturePausedUntilRef.current = Number.MAX_SAFE_INTEGER;
          pendingBufferRef.current = new Float32Array();
          setStatus("speaking");
          setStatusText("语音秘书正在播报结果...");
        };
        audio.onended = () => finalizePlayback();
        audio.onerror = () => {
          finalizePlayback();
          if (fallbackText) {
            speakText(fallbackText);
          }
        };
        void audio.play().catch((playError) => {
          console.error("[VoiceSecretary] audio playback failed", playError);
          finalizePlayback();
          if (fallbackText) {
            speakText(fallbackText);
          }
        });
      } catch (playError) {
        console.error("[VoiceSecretary] invalid audio payload", playError);
        speakText(fallbackText);
      }
    },
    [cancelSpeech, speakText],
  );

  const handleServerMessage = useCallback(
    (payload: Record<string, unknown>) => {
      const type = String(payload.type || "").trim();
      if (type === "ready") {
        setConnected(true);
        setStatus("idle");
        setStatusText("语音秘书已连接，点击唤醒开始");
        setError("");
        return;
      }

      if (type === "turn_state") {
        const turnState = (payload.turnState || {}) as VoiceSecretaryTurnState;
        const nextState = String(turnState.state || "idle").trim();
        const previewText = getTurnPreviewText(turnState);
        setLastTurnState(turnState);
        if (Date.now() < capturePausedUntilRef.current && nextState !== "idle") {
          return;
        }
        if (nextState === "nonidle") {
          cancelSpeech();
          setStatus("listening");
          setStatusText("正在听你说...");
          setPartialTranscript(previewText);
          if (previewText) setTranscript(previewText);
          return;
        }
        if (nextState === "speak") {
          cancelSpeech();
          setStatus("processing");
          setStatusText("正在理解你的语音请求...");
          setPartialTranscript(previewText);
          if (previewText) setTranscript(previewText);
          return;
        }
        const currentStatus = statusRef.current;
        if (nextState === "idle" && currentStatus !== "processing" && currentStatus !== "speaking") {
          setStatus("idle");
          setStatusText("语音秘书待命中");
        }
        return;
      }

      if (type === "assistant_greeting") {
        // VSA 主动问候（连接建立时）
        const greeting = String(payload.spoken || "").trim();
        if (greeting) {
          setPartialTranscript("");
          setTranscript(greeting);
          setLastResult({
            spoken: greeting,
            routeResult: "vsa_handled",
            screen: {
              kind: "voice_secretary_result",
              title: "语音秘书问候",
              summary: greeting,
              originalText: "",
            },
          });
        }
        return;
      }

      if (type === "assistant_status") {
        setStatus("processing");
        setStatusText(String(payload.text || "语音秘书正在处理当前请求...").trim());
        return;
      }

      if (type === "assistant_result") {
        const result = payload as unknown as VoiceSecretaryResult & {
          sessionId?: string;
          traceId?: string;
          trace_id?: string;
        };
        const resultKey = [
          String(result.sessionId || "").trim(),
          String(result.traceId || result.trace_id || "").trim(),
          String(result.spoken || "").trim(),
        ].join("|");
        if (resultKey && resultKey === lastAssistantResultKeyRef.current) {
          return;
        }
        lastAssistantResultKeyRef.current = resultKey;
        setLastResult(result);
        setPartialTranscript("");
        const originalText = String(result.screen?.originalText || "").trim();
        if (originalText) setTranscript(originalText);
        const spoken = String(result.spoken || "").trim();
        // 流式 TTS 模式下，音频通过 stream 事件推送，不在这里播放
        // 只在没有任何服务端音频（既无 blob 也无 stream）时才 fallback 到浏览器 TTS
        if (spoken && !result.audio?.data) {
          // 不触发浏览器 TTS，流式音频会通过 assistant_audio_stream_* 事件推送
          setStatus("speaking");
          setStatusText("语音秘书正在播报结果...");
        } else if (!spoken) {
          setStatus("idle");
          setStatusText(activeRef.current ? "语音秘书监听中" : "语音秘书待命中（点击唤醒）");
        }
        // ★ 收到回复后重置自动休眠计时器
        if (activeRef.current) {
          resetAutoSleepTimer();
        }
        return;
      }

      // 流式音频事件 — VoxCPM generate_streaming 逐块推送
      if (type === "assistant_audio_stream_start") {
        const audio = (payload.audio || {}) as VoiceSecretaryStreamAudioStart;
        const reqId = String(payload.requestId || "").trim();
        cancelSpeech();
        streamActiveReqIdRef.current = reqId;
        streamSampleRateRef.current = Number(audio.sample_rate || 48000);
        streamNextTimeRef.current = 0;
        // 记录流式音频首块到达时间
        streamStartTimeRef.current = Date.now();
        try {
          const ctx = new AudioContext({ sampleRate: streamSampleRateRef.current });
          streamAudioCtxRef.current = ctx;
          if (ctx.state === "suspended") void ctx.resume();
        } catch (e) {
          console.error("[VoiceSecretary] stream AudioContext init failed", e);
        }
        capturePausedUntilRef.current = Number.MAX_SAFE_INTEGER;
        pendingBufferRef.current = new Float32Array();
        setStatus("speaking");
        setStatusText("语音秘书正在播报结果...");
        return;
      }

      if (type === "assistant_audio_stream_chunk") {
        const reqId = String(payload.requestId || "").trim();
        if (reqId !== streamActiveReqIdRef.current) return;
        const audio = (payload.audio || {}) as VoiceSecretaryStreamAudioChunk;
        const pcmBase64 = String(audio.data || "").trim();
        if (!pcmBase64) return;
        const ctx = streamAudioCtxRef.current;
        if (!ctx) return;
        try {
          const pcmBytes = base64ToUint8Array(pcmBase64);
          const int16 = new Int16Array(pcmBytes.buffer);
          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
          }
          const audioBuffer = ctx.createBuffer(1, float32.length, streamSampleRateRef.current);
          audioBuffer.getChannelData(0).set(float32);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          const now = ctx.currentTime;
          const startTime = Math.max(now, streamNextTimeRef.current);
          source.start(startTime);
          streamNextTimeRef.current = startTime + audioBuffer.duration;
        } catch (e) {
          console.error("[VoiceSecretary] stream chunk decode failed", e);
        }
        return;
      }

      if (type === "assistant_audio_stream_end") {
        const reqId = String(payload.requestId || "").trim();
        if (reqId !== streamActiveReqIdRef.current) return;
        streamActiveReqIdRef.current = "";
        // 动态计算清理延迟：确保所有已调度音频播完
        // 基于已调度的 streamNextTime 减去当前 AudioContext 时间，加上安全余量
        const ctx = streamAudioCtxRef.current;
        let cleanupDelayMs = 500; // 最小安全延迟
        if (ctx && streamNextTimeRef.current > 0) {
          const remainingMs = Math.max(0, (streamNextTimeRef.current - ctx.currentTime) * 1000);
          cleanupDelayMs = Math.max(500, remainingMs + 800); // 至少等音频播完+800ms余量
        }
        console.log("[VoiceSecretary] stream end, cleanup delay=%dms", cleanupDelayMs);
        setTimeout(() => {
          capturePausedUntilRef.current = Date.now() + SPEECH_CAPTURE_COOLDOWN_MS;
          pendingBufferRef.current = new Float32Array();
          setStatus("idle");
          setStatusText("语音秘书待命中");
          const activeCtx = streamAudioCtxRef.current;
          if (activeCtx) {
            try { activeCtx.close(); } catch { /* noop */ }
            streamAudioCtxRef.current = null;
          }
        }, cleanupDelayMs);
        return;
      }

      // 兼容 blob 音频事件（非流式 fallback）
      if (type === "assistant_audio_blob") {
        const audio = (payload.audio || {}) as VoiceSecretaryAudioPayload;
        const fallbackText = String(audio.text || "").trim();
        playAudioPayload(audio, fallbackText);
        return;
      }

      if (type === "assistant_ignored") {
        const originalText = String(payload.originalText || "").trim();
        setPartialTranscript("");
        if (originalText) {
          setTranscript(originalText);
        }
        setLastResult({
          spoken: "",
          routeResult: "ignored",
          screen: {
            kind: "voice_secretary_result",
            title: "已收到语音",
            summary: "当前语句不包含明确指令，静默处理。",
            originalText,
          },
        });
        setError("");
        setStatus("idle");
        setStatusText(activeRef.current ? "语音秘书监听中" : "语音秘书待命中（点击唤醒）");
        // ★ 收到忽略后也重置自动休眠计时器
        if (activeRef.current) {
          resetAutoSleepTimer();
        }
        return;
      }

      if (type === "assistant_error") {
        const nextError = String(payload.error || "语音秘书链路异常").trim();
        setError(nextError);
        setStatus("error");
        setStatusText(nextError || "语音秘书链路异常");
      }
    },
    [cancelSpeech, playAudioPayload],
  );

  const start = useCallback(async () => {
    if (startInFlightRef.current) {
      return;
    }
    if (!supported || !userId) {
      setStatus("error");
      setStatusText("当前浏览器不支持语音秘书");
      setError("当前浏览器不支持语音秘书");
      return;
    }

    if (wsRef.current) {
      const readyState = wsRef.current.readyState;
      if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) {
        return;
      }
    }

    setError("");
    setConnected(false);
    setLastResult(null);
    setLastTurnState(null);
    setPartialTranscript("");
    setTranscript("");
    setStatus("connecting");
    setStatusText("正在连接语音秘书...");
    manualCloseRef.current = false;
    startInFlightRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const ws = new WebSocket(buildVoiceSecretaryWsUrl(userId));
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          handleServerMessage(JSON.parse(String(event.data || "{}")) as Record<string, unknown>);
        } catch (parseError) {
          console.error("[VoiceSecretary] invalid server payload", parseError);
        }
      };
      ws.onerror = () => {
        setStatus("error");
        setStatusText("语音秘书连接失败");
        setError("语音秘书连接失败");
      };
      ws.onclose = () => {
        setConnected(false);
        if (!manualCloseRef.current) {
          setStatus("error");
          setStatusText("语音秘书连接已断开");
          setError("语音秘书连接已断开");
        }
      };

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          ws.removeEventListener("open", handleOpen);
          ws.removeEventListener("error", handleError);
          ws.removeEventListener("close", handleCloseBeforeOpen);
        };
        const handleOpen = () => {
          cleanup();
          setConnected(true);
          setStatus("connecting");
          setStatusText("语音通道已建立，正在初始化...");
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error("语音秘书连接失败"));
        };
        const handleCloseBeforeOpen = () => {
          cleanup();
          reject(new Error("语音秘书连接在建立前被关闭"));
        };
        ws.addEventListener("open", handleOpen);
        ws.addEventListener("error", handleError);
        ws.addEventListener("close", handleCloseBeforeOpen);
      });

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      sinkGainRef.current = gainNode;

      processor.onaudioprocess = (event) => {
        const targetWs = wsRef.current;
        if (!targetWs || targetWs.readyState !== WebSocket.OPEN) return;
        // ★ 未激活时不发送音频，麦克风静默
        if (!activeRef.current) {
          pendingBufferRef.current = new Float32Array();
          return;
        }
        if (Date.now() < capturePausedUntilRef.current) {
          pendingBufferRef.current = new Float32Array();
          return;
        }
        const rawInput = event.inputBuffer.getChannelData(0);
        const downsampled = downsampleFloat32(new Float32Array(rawInput), audioContext.sampleRate, TARGET_SAMPLE_RATE);
        if (!downsampled.length) return;
        let merged = concatFloat32Arrays(pendingBufferRef.current, downsampled);
        while (merged.length >= TARGET_CHUNK_SIZE) {
          const chunk = merged.slice(0, TARGET_CHUNK_SIZE);
          targetWs.send(
            JSON.stringify({
              type: "audio_chunk",
              audio: float32ToBase64(chunk),
              sampleRate: TARGET_SAMPLE_RATE,
              format: "f32le-base64",
            }),
          );
          merged = merged.slice(TARGET_CHUNK_SIZE);
        }
        pendingBufferRef.current = merged;
      };

      sourceNode.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);
    } catch (connectError) {
      console.error("[VoiceSecretary] start failed", connectError);
      await disconnectInternal();
      setConnected(false);
      setStatus("error");
      setStatusText("语音秘书启动失败，请检查麦克风权限或服务状态");
      setError(String((connectError as Error)?.message || "语音秘书启动失败"));
    } finally {
      startInFlightRef.current = false;
    }
  }, [disconnectInternal, handleServerMessage, supported, userId]);

  const stop = useCallback(async () => {
    manualCloseRef.current = true;
    activeRef.current = false;
    setActive(false);
    clearAutoSleepTimer();
    setConnected(false);
    setStatus("idle");
    setStatusText("语音秘书已结束");
    await disconnectInternal();
  }, [clearAutoSleepTimer, disconnectInternal]);

  const reconnect = useCallback(async () => {
    await stop();
    await start();
  }, [start, stop]);

  useEffect(() => {
    if (!enabled) {
      manualCloseRef.current = true;
      activeRef.current = false;
      setActive(false);
      clearAutoSleepTimer();
      void disconnectInternal();
      setConnected(false);
      setStatus("idle");
      setStatusText("语音秘书待命中");
      return;
    }
    manualCloseRef.current = false;
    void start();
    return () => {
      manualCloseRef.current = true;
      activeRef.current = false;
      setActive(false);
      clearAutoSleepTimer();
      void disconnectInternal();
    };
  }, [clearAutoSleepTimer, disconnectInternal, enabled, start]);

  useEffect(() => () => cancelSpeech(), [cancelSpeech]);

  return {
    supported,
    browserSpeechSupported,
    connected,
    active,
    activate,
    deactivate,
    status,
    statusText,
    partialTranscript,
    transcript,
    lastTurnState,
    lastResult,
    error,
    start,
    stop,
    reconnect,
  };
}
