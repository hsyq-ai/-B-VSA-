import { useEffect, useMemo } from "react";
import { Button, Space, Tag } from "antd";
import { LoaderCircle, Mic, MicOff, Minus, Radio, RotateCcw, Volume2, X } from "lucide-react";
import { useVoiceSecretary } from "../../../features/core/voice/useVoiceSecretary";
import styles from "./VoiceSecretaryOverlay.module.less";

interface VoiceSecretaryOverlayProps {
  visible: boolean;
  enabled: boolean;
  userId: string;
  userName?: string;
  onMinimize: () => void;
  onClose: () => void;
}

const statusMetaMap = {
  idle: { label: "待命", color: "#4f46e5" },
  connecting: { label: "连接中", color: "#2563eb" },
  listening: { label: "正在听", color: "#0ea5e9" },
  processing: { label: "处理中", color: "#f97316" },
  speaking: { label: "正在播报", color: "#10b981" },
  error: { label: "异常", color: "#ef4444" },
} as const;

export default function VoiceSecretaryOverlay({ visible, enabled, userId, userName, onMinimize, onClose }: VoiceSecretaryOverlayProps) {
  const {
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
    lastResult,
    error,
    start,
    stop,
    reconnect,
  } = useVoiceSecretary({ enabled, userId, userName });

  useEffect(() => {
    if (!visible) return undefined;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onMinimize();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onMinimize, visible]);

  const statusMeta = useMemo(() => statusMetaMap[status], [status]);
  const liveText = partialTranscript || transcript || (connected && !active ? "点击「唤醒」开始语音对话" : connected ? "请直接说出你要我帮你处理的事情" : "语音秘书待连接");
  const screen = lastResult?.screen || {};

  if (!visible) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="false" aria-label="语音秘书浮层">
      <div className={styles.header}>
        <div>
          <div className={styles.title}>语音秘书 · 小智</div>
          <div className={styles.subtitle}>{connected ? (active ? "小智正在听你说" : "点击「唤醒」开始语音对话") : "语音秘书待连接"}</div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.iconButton} onClick={onMinimize} aria-label="缩小语音秘书">
            <Minus size={18} />
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => {
              void stop().finally(onClose);
            }}
            aria-label="关闭语音秘书"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className={styles.statusPanel}>
        <div className={styles.statusOrbWrap}>
          <div className={`${styles.statusOrb} ${styles[`statusOrb${status[0].toUpperCase()}${status.slice(1)}` as keyof typeof styles] || ""}`.trim()}>
            {status === "processing" || status === "connecting" ? <LoaderCircle size={26} className={styles.spin} /> : status === "speaking" ? <Volume2 size={26} /> : status === "listening" ? <Radio size={26} /> : <Mic size={26} />}
          </div>
        </div>
        <div className={styles.statusText} style={{ color: statusMeta.color }}>
          <span className={styles.statusDot} style={{ background: statusMeta.color }} />
          {statusMeta.label}
        </div>
        <div className={styles.statusHint}>{statusText}</div>
        <Space size={[8, 8]} wrap>
          <Tag color={connected ? "success" : "default"}>{connected ? "已连接" : enabled ? "后台运行中" : "未连接"}</Tag>
          <Tag color={lastResult?.audio?.data ? "success" : browserSpeechSupported ? "processing" : "warning"}>
            {lastResult?.audio?.data ? "服务端自然语音已启用" : browserSpeechSupported ? "浏览器语音兜底可用" : "当前浏览器不支持兜底播报"}
          </Tag>
          {!supported ? <Tag color="error">当前环境不支持语音输入</Tag> : null}
        </Space>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>实时转写</div>
        <div className={styles.transcript}>{liveText}</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardLabel}>最新结果</div>
        {screen.title || lastResult?.spoken ? (
          <div className={styles.resultWrap}>
            <div className={styles.resultTitle}>{screen.title || "语音秘书已接手"}</div>
            <div className={styles.resultSummary}>{screen.summary || lastResult?.spoken || "当前请求已进入处理链路。"}</div>
            {screen.reply ? <div className={styles.replyBox}>{String(screen.reply || "")}</div> : null}
          </div>
        ) : (
          <div className={styles.emptyState}>小智会在这里显示回复结果。</div>
        )}
      </div>

      {error ? <div className={styles.errorText}>{error}</div> : null}

      <div className={styles.footer}>
        <Button onClick={() => void reconnect()} icon={<RotateCcw size={14} />}>
          重连
        </Button>
        <Button onClick={() => void stop().finally(onClose)}>
          结束会话
        </Button>
        <Button
          type="primary"
          onClick={() => {
            if (!connected) {
              void start();
            } else if (!active) {
              activate();
            } else {
              deactivate();
            }
          }}
          icon={active ? <MicOff size={14} /> : <Mic size={14} />}
        >
          {!connected ? "连接" : active ? "休眠" : "唤醒"}
        </Button>
      </div>
    </div>
  );
}
