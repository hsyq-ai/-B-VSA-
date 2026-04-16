import { Layout } from "antd";
import { lazy, Suspense, useMemo } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "../Sidebar";
import Header from "../Header";
import ConsoleCronBubble from "../../components/ConsoleCronBubble";
import AuthModal from "../../components/AuthModal";
import styles from "../index.module.less";
import EmployeeSidebar from "../../components/employee/EmployeeSidebar";
import EmployeeHeader from "../../components/employee/EmployeeHeader";
import GlobalAiCopilotBar from "../../components/employee/ai/GlobalAiCopilotBar";
import FloatingAiDock from "../../components/employee/ai/FloatingAiDock";
import AppRouteRegistry from "../../features/core/app/AppRouteRegistry";
import RouteContentFallback from "../../features/core/app/RouteContentFallback";
import { useAuthBootstrap } from "../../features/core/app/useAuthBootstrap";
import { usePushBridge } from "../../features/core/app/usePushBridge";
import { resolveConsoleNavKey } from "../../features/core/employee-navigation";

const Chat = lazy(() => import("../../pages/Chat"));
const { Content } = Layout;

export default function MainLayout() {
  const location = useLocation();
  const currentPath = location.pathname;
  const selectedKey = useMemo(() => resolveConsoleNavKey(currentPath), [currentPath]);
  const isWorkspaceEmbed =
    currentPath === "/app/workspace-embed" || currentPath.startsWith("/app/workspace-embed/");

  const { authed, isAdmin, employeeHomePath, handleAuthenticated, handleLogout } =
    useAuthBootstrap(currentPath);

  usePushBridge(authed, isAdmin);

  if (!authed) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top right, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0) 26%), linear-gradient(135deg, #fdf4f1 0%, #fbe4de 42%, #f4d2cc 100%)",
        }}
      >
        <AuthModal open onAuthenticated={handleAuthenticated} />
      </div>
    );
  }

  if (isWorkspaceEmbed) {
    return (
      <div style={{ height: "100vh", width: "100%", background: "#fff" }}>
        <Suspense fallback={<RouteContentFallback />}>
          <Routes>
            <Route path="/app/workspace-embed" element={<Chat />} />
            <Route path="/app/workspace-embed/:chatId" element={<Chat />} />
            <Route path="*" element={<Navigate to="/app/workspace-embed" replace />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <Layout className={styles.mainLayout}>
      {isAdmin ? (
        <Sidebar selectedKey={selectedKey} isAdmin={isAdmin} />
      ) : (
        <EmployeeSidebar selectedKey={selectedKey} />
      )}

      <Layout className={styles.contentLayout}>
        {isAdmin ? (
          <Header onLogout={handleLogout} />
        ) : (
          <EmployeeHeader selectedKey={selectedKey} onLogout={handleLogout} />
        )}

        <Content className={styles.pageContainer}>
          <ConsoleCronBubble />
          {!isAdmin ? <GlobalAiCopilotBar selectedKey={selectedKey} currentPath={currentPath} /> : null}
          <div className="page-content">
            <AppRouteRegistry employeeHomePath={employeeHomePath} isAdmin={isAdmin} />
          </div>
          {!isAdmin ? <FloatingAiDock selectedKey={selectedKey} currentPath={currentPath} /> : null}
        </Content>
      </Layout>
    </Layout>
  );
}
