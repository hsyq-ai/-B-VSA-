import { Spin } from "antd";

export default function RouteContentFallback() {
  return (
    <div
      style={{
        minHeight: 240,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Spin size="large" />
    </div>
  );
}
