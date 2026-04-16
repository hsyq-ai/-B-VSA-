import { useMemo } from "react";
import { SparkDownloadLine } from "@agentscope-ai/icons";
import styles from "./FileDownloadCard.module.less";

const formatBytes = (size?: number) => {
  if (!size || Number.isNaN(size)) return "未知大小";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  for (let i = 0; i < units.length; i += 1) {
    if (value < 1024 || i === units.length - 1) {
      return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
    }
    value /= 1024;
  }
  return `${value.toFixed(1)} GB`;
};

const getExtLabel = (name: string) => {
  const ext = name.split(".").pop() || "";
  return ext ? ext.slice(0, 4) : "FILE";
};

export default function FileDownloadCard(props: { data: any }) {
  const fileInfo = useMemo(() => {
    const content = props.data?.content || [];
    const inputArgs = content?.[0]?.data?.arguments || {};
    const output = content?.[1]?.data?.output || {};
    return {
      name:
        output.file_name ||
        output.name ||
        inputArgs.file_name ||
        inputArgs.name ||
        "文件",
      url:
        output.file_url ||
        output.url ||
        output.download_url ||
        inputArgs.file_url ||
        "",
      size: output.file_size || output.size || undefined,
      description:
        output.message_text ||
        output.description ||
        inputArgs.description ||
        "",
    };
  }, [props.data]);

  if (!fileInfo.url) return null;

  return (
    <div className={styles.card}>
      <div className={styles.icon}>{getExtLabel(fileInfo.name)}</div>
      <div className={styles.info}>
        <div className={styles.name} title={fileInfo.name}>
          {fileInfo.name}
        </div>
        <div className={styles.meta}>{formatBytes(fileInfo.size)}</div>
        {fileInfo.description ? (
          <div className={styles.description}>{fileInfo.description}</div>
        ) : null}
      </div>
      <div className={styles.actions}>
        <a
          className={styles.downloadBtn}
          href={fileInfo.url}
          target="_blank"
          rel="noreferrer"
        >
          <SparkDownloadLine />
          下载
        </a>
      </div>
    </div>
  );
}
