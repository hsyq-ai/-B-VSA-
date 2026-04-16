import { createGlobalStyle } from "antd-style";
import { ConfigProvider } from "@agentscope-ai/design";
import { BrowserRouter } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import "./styles/layout.css";
import "./styles/form-override.css";

const GlobalStyle = createGlobalStyle`
* {
  margin: 0;
  box-sizing: border-box;
}
`;

function App() {
  const themeConfig = {
    token: {
      colorPrimary: "#6366f1",
      borderRadius: 10,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
  };
  return (
    <BrowserRouter>
      <GlobalStyle />
      <ConfigProvider theme={themeConfig as any} prefix="copaw" prefixCls="copaw">
        <MainLayout />
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
