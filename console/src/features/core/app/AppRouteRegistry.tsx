import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import RouteContentFallback from "./RouteContentFallback";

const ProfileEditor = lazy(() => import("../../../pages/ProfileEditor"));
const ChannelsPage = lazy(() => import("../../../pages/Control/Channels"));
const SessionsPage = lazy(() => import("../../../pages/Control/Sessions"));
const CronJobsPage = lazy(() => import("../../../pages/Control/CronJobs"));
const HeartbeatPage = lazy(() => import("../../../pages/Control/Heartbeat"));
const AgentConfigPage = lazy(() => import("../../../pages/Agent/Config"));
const SkillsPage = lazy(() => import("../../../pages/Agent/Skills"));
const ToolsPage = lazy(() => import("../../../pages/Agent/Tools"));
const WorkspacePage = lazy(() => import("../../../pages/Agent/Workspace"));
const MCPPage = lazy(() => import("../../../pages/Agent/MCP"));
const ModelsPage = lazy(() => import("../../../pages/Settings/Models"));
const EnvironmentsPage = lazy(() => import("../../../pages/Settings/Environments"));
const SecurityPage = lazy(() => import("../../../pages/Settings/Security"));
const TokenUsagePage = lazy(() => import("../../../pages/Settings/TokenUsage"));
const ManagerPage = lazy(() => import("../../../pages/Manager"));
const PromptTemplatesPage = lazy(() => import("../../../pages/PromptTemplates"));
const DigitalExpertTemplatesPage = lazy(() => import("../../../pages/DigitalExpertTemplates"));
const DashboardSkillTemplatesPage = lazy(() => import("../../../pages/DashboardSkillTemplates"));
const ExpertCenterSkillTemplatesPage = lazy(() => import("../../../pages/ExpertCenterSkillTemplates"));
const PlatformLearningPage = lazy(() => import("../../../pages/PlatformLearning"));
const ArchiveManagerPage = lazy(() => import("../../../pages/ArchiveManager"));
const AgentOSRoomsPage = lazy(() => import("../../../pages/AgentOS/Rooms"));
const AgentOSTracesPage = lazy(() => import("../../../pages/AgentOS/Traces"));
const AgentOSArtifactsPage = lazy(() => import("../../../pages/AgentOS/Artifacts"));
const AgentOSEvalsPage = lazy(() => import("../../../pages/AgentOS/Evals"));
const Chat = lazy(() => import("../../../pages/Chat"));
const EmployeeSecretary = lazy(() => import("../../../pages/Employee/Secretary"));
const ResearchExperimentPage = lazy(() => import("../../../pages/Employee/ResearchExperiment"));
const EmployeeSessions = lazy(() => import("../../../pages/Employee/Sessions"));
const EmployeeInbox = lazy(() => import("../../../pages/Employee/Inbox"));
const ExpertCenterPage = lazy(() => import("../../../pages/Employee/ExpertCenter"));
const EmployeeCenterPage = lazy(() => import("../../../pages/Employee/EmployeeCenter"));
const ExpertDetailPage = lazy(() => import("../../../pages/Employee/ExpertDetail"));
const EmployeeDetailPage = lazy(() => import("../../../pages/Employee/EmployeeDetail"));
const MemberTasksPage = lazy(() => import("../../../pages/Employee/MemberTasks"));
const MemberLearningPage = lazy(() => import("../../../pages/Employee/MemberLearning"));
const MemberGrowthPage = lazy(() => import("../../../pages/Employee/MemberGrowth"));
const MemberActivityPage = lazy(() => import("../../../pages/Employee/MemberActivity"));
const MemberDirectivesPage = lazy(() => import("../../../pages/Employee/MemberDirectives"));
const MemberSupportPage = lazy(() => import("../../../pages/Employee/MemberSupport"));
const MemberAffairsPage = lazy(() => import("../../../pages/Employee/MemberAffairs"));
const EmployeePartyAffairsPage = lazy(() => import("../../../pages/Employee/PartyAffairs"));
const EmployeeActivityCollabPage = lazy(() => import("../../../pages/Employee/ActivityCollab"));
const EmployeeOrganizationCarePage = lazy(() => import("../../../pages/Employee/OrganizationCare"));
const EmployeeLearningCoachPage = lazy(() => import("../../../pages/Employee/LearningCoach"));
const EmployeeMemberEvaluationPage = lazy(() => import("../../../pages/Employee/MemberEvaluation"));
const EmployeeBranchRankingPage = lazy(() => import("../../../pages/Employee/BranchRanking"));
const EmployeeDirectiveCenterPage = lazy(() => import("../../../pages/Employee/DirectiveCenter"));
const ArchivePage = lazy(() => import("../../../pages/Employee/Archive"));

interface AppRouteRegistryProps {
  employeeHomePath: string;
  isAdmin: boolean;
}

export default function AppRouteRegistry({ employeeHomePath, isAdmin }: AppRouteRegistryProps) {
  return (
    <Suspense fallback={<RouteContentFallback />}>
      <Routes>
        <Route path="/app/secretary" element={<EmployeeSecretary />} />
        <Route path="/app/research-experiment" element={<ResearchExperimentPage />} />
        <Route path="/app/research-experiment/:jobId" element={<ResearchExperimentPage />} />
        <Route path="/app/expert-center" element={<ExpertCenterPage />} />
        <Route path="/app/employee-center" element={<EmployeeCenterPage />} />
        <Route path="/app/sessions" element={<EmployeeSessions />} />
        <Route path="/app/inbox" element={<EmployeeInbox />} />
        <Route path="/app/workspace" element={<Chat />} />
        <Route path="/app/workspace/:chatId" element={<Chat />} />
        <Route path="/app/profile" element={<ProfileEditor />} />
        <Route path="/app/settings" element={<ProfileEditor />} />
        <Route path="/app/expert/:expertId" element={<ExpertDetailPage />} />
        <Route path="/app/employee/:employeeId" element={<EmployeeDetailPage />} />
        <Route path="/app/member/tasks" element={<MemberTasksPage />} />
        <Route path="/app/member/directives" element={<MemberDirectivesPage />} />
        <Route path="/app/member/learning" element={<MemberLearningPage />} />
        <Route path="/app/member/growth" element={<MemberGrowthPage />} />
        <Route path="/app/member/activity" element={<MemberActivityPage />} />
        <Route path="/app/member/support" element={<MemberSupportPage />} />
        <Route path="/app/member/affairs" element={<MemberAffairsPage />} />
        <Route path="/app/party/party-affairs" element={<EmployeePartyAffairsPage />} />
        <Route path="/app/party/organization-care" element={<EmployeeOrganizationCarePage />} />
        <Route path="/app/party/activity-collab" element={<EmployeeActivityCollabPage />} />
        <Route path="/app/party/learning-coach" element={<EmployeeLearningCoachPage />} />
        <Route path="/app/party/member-evaluation" element={<EmployeeMemberEvaluationPage />} />
        <Route path="/app/party/branch-ranking" element={<EmployeeBranchRankingPage />} />
        <Route path="/app/party/directive-center" element={<EmployeeDirectiveCenterPage />} />
        <Route path="/app/party/archive" element={<ArchivePage />} />

        <Route path="/admin" element={<Navigate to="/admin/chat" replace />} />

        <Route path="/profile" element={<ProfileEditor />} />
        <Route path="/admin/profile" element={<ProfileEditor />} />

        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:chatId" element={<Chat />} />
        <Route path="/admin/chat" element={<Chat />} />
        <Route path="/admin/chat/:chatId" element={<Chat />} />

        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/admin/channels" element={<ChannelsPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/admin/sessions" element={<SessionsPage />} />
        <Route path="/cron-jobs" element={<CronJobsPage />} />
        <Route path="/admin/cron-jobs" element={<CronJobsPage />} />
        <Route path="/heartbeat" element={<HeartbeatPage />} />
        <Route path="/admin/heartbeat" element={<HeartbeatPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/admin/skills" element={<SkillsPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/admin/tools" element={<ToolsPage />} />
        <Route path="/mcp" element={<MCPPage />} />
        <Route path="/admin/mcp" element={<MCPPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/admin/workspace" element={<WorkspacePage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/admin/models" element={<ModelsPage />} />
        <Route path="/environments" element={<EnvironmentsPage />} />
        <Route path="/admin/environments" element={<EnvironmentsPage />} />
        <Route path="/agent-config" element={<AgentConfigPage />} />
        <Route path="/admin/agent-config" element={<AgentConfigPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/admin/security" element={<SecurityPage />} />
        <Route path="/token-usage" element={<TokenUsagePage />} />
        <Route path="/admin/token-usage" element={<TokenUsagePage />} />

        <Route path="/prompt-templates" element={isAdmin ? <PromptTemplatesPage /> : <Chat />} />
        <Route path="/admin/prompt-templates" element={isAdmin ? <PromptTemplatesPage /> : <Chat />} />
        <Route
          path="/digital-expert-templates"
          element={isAdmin ? <DigitalExpertTemplatesPage /> : <Chat />}
        />
        <Route
          path="/admin/digital-expert-templates"
          element={isAdmin ? <DigitalExpertTemplatesPage /> : <Chat />}
        />
        <Route
          path="/dashboard-skill-templates"
          element={isAdmin ? <DashboardSkillTemplatesPage /> : <Chat />}
        />
        <Route
          path="/admin/dashboard-skill-templates"
          element={isAdmin ? <DashboardSkillTemplatesPage /> : <Chat />}
        />
        <Route
          path="/expert-center-skill-templates"
          element={isAdmin ? <ExpertCenterSkillTemplatesPage /> : <Chat />}
        />
        <Route
          path="/admin/expert-center-skill-templates"
          element={isAdmin ? <ExpertCenterSkillTemplatesPage /> : <Chat />}
        />
        <Route path="/platform-learning" element={isAdmin ? <PlatformLearningPage /> : <Chat />} />
        <Route path="/admin/platform-learning" element={isAdmin ? <PlatformLearningPage /> : <Chat />} />
        <Route path="/archive" element={isAdmin ? <ArchiveManagerPage /> : <Chat />} />
        <Route path="/admin/archive" element={isAdmin ? <ArchiveManagerPage /> : <Chat />} />
        <Route path="/admin/rooms" element={isAdmin ? <AgentOSRoomsPage /> : <Chat />} />
        <Route path="/admin/traces" element={isAdmin ? <AgentOSTracesPage /> : <Chat />} />
        <Route path="/admin/artifacts" element={isAdmin ? <AgentOSArtifactsPage /> : <Chat />} />
        <Route path="/admin/evals" element={isAdmin ? <AgentOSEvalsPage /> : <Chat />} />
        <Route path="/manager" element={isAdmin ? <ManagerPage /> : <Chat />} />
        <Route path="/admin/manager" element={isAdmin ? <ManagerPage /> : <Chat />} />

        <Route path="*" element={<Navigate to={isAdmin ? "/manager" : employeeHomePath} replace />} />
      </Routes>
    </Suspense>
  );
}
