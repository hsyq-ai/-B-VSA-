import { useEffect, useRef, useState } from "react";
import { Button, message, Tooltip } from "antd";
import { Mic, StopCircle } from "lucide-react";
import { getApiToken, getApiUrl } from "../api/config";

type Status = "idle" | "recording" | "transcribing";

function getTextarea(): HTMLTextAreaElement | null {
  return document.querySelector(
    '.copaw-chat-anywhere-input textarea, .chat-anywhere-input textarea, [class*="chat-anywhere-input"] textarea',
  ) as HTMLTextAreaElement | null;
}

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const { set } = Object.getOwnPropertyDescriptor(proto, "value") || {};
  if (set) set.call(el, value);
}

function appendToInput(text: string) {
  const el = getTextarea();
  if (!el) return;
  const prev = el.value || "";
  const next = prev ? `${prev} ${text}` : text;
  setNativeValue(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

export default function VoiceInputButton() {
  const [status, setStatus] = useState<Status>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    if (status !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        try {
          setStatus("transcribing");
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
          const file = new File([blob], "speech.webm", { type: blob.type });
          const form = new FormData();
          form.append("file", file);
          form.append("lang", "zh");
          const token = getApiToken();
          const resp = await fetch(getApiUrl("/asr/transcribe"), {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: form,
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(txt || "ASR failed");
          }
          const json = await resp.json();
          const text = String(json?.text || "").trim();
          if (text) {
            appendToInput(text);
            message.success("识别完成");
          } else {
            message.warning("未识别到内容");
          }
        } catch (err: any) {
          message.error(err?.message || "语音识别失败");
        } finally {
          setStatus("idle");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch (err) {
      message.error("无法获取麦克风权限");
    }
  };

  const stopRecording = () => {
    if (status !== "recording") return;
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const disabled = status === "transcribing";
  const isRecording = status === "recording";
  const iconColor = isRecording ? "#7FB8FF" : "currentColor";

  return (
    <Tooltip title={status === "recording" ? "停止录音" : "语音转文字"}>
      <Button
        type="text"
        size="small"
        disabled={disabled}
        onClick={status === "recording" ? stopRecording : startRecording}
        style={{ marginLeft: 6 }}
      >
        {isRecording ? (
          <StopCircle size={18} color={iconColor} />
        ) : (
          <Mic size={18} color={iconColor} />
        )}
      </Button>
    </Tooltip>
  );
}
