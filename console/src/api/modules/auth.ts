import { request } from "../request";

export interface UserProfileStatus {
  hasCompleteProfile: boolean;
  department?: string | null;
  profile_id: number;
}

export interface AuthUser {
  user_id: number;
  profile_id: number;
  name: string;
  phone: string;
  role: "employee" | "admin";
  status: "pending" | "active" | "disabled" | "rejected";
  department?: string | null;
  exp: number;
}

export interface LoginResponse {
  token: string;
  user_profile: string;
  public_memory: string;
  hasCompleteProfile: boolean;
}

export interface AdminUserRow {
  id: number;
  name: string;
  phone: string;
  role: "employee" | "admin";
  status: "pending" | "active" | "disabled" | "rejected";
  profile_id: number;
  created_at: string;
  department?: string;
  position?: string;
  english_name?: string;
  nickname?: string;
  aliases?: any;
  title?: string;
  is_executive?: any;
}

export const authApi = {
  login: (identifier: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),
  getMe: () => request<AuthUser>("/auth/me"),
  getProfileStatus: () => request<UserProfileStatus>("/auth/me/profile/status"),
  listAdminUsers: (params?: any) => {
    const search = params
      ? `?page=${params.page || 1}&page_size=${params.page_size || 20}`
      : "";
    return request<AdminUserRow[] | { items: AdminUserRow[]; total: number }>(
      `/auth/admin/users${search}`,
    );
  },
  approveUser: (userId: number) =>
    request<{ message: string; role: string }>(
      `/auth/admin/users/${userId}/approve`,
      { method: "POST" },
    ),
  rejectUser: (userId: number) =>
    request<{ message: string }>(`/auth/admin/users/${userId}/reject`, {
      method: "POST",
    }),
  updateUserStatus: (userId: number, status: AdminUserRow["status"]) =>
    request<{ message: string; status: string }>(
      `/auth/admin/users/${userId}/status`,
      {
        method: "POST",
        body: JSON.stringify({ status }),
      },
    ),
  updateUserRole: (userId: number, role: AdminUserRow["role"]) =>
    request<{ message: string; role: string }>(`/auth/admin/users/${userId}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
  resetPassword: (userId: number, newPassword: string) =>
    request<{ message: string }>(`/auth/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword }),
    }),
  getPublicMemory: () => request<{ content: string }>("/auth/admin/memory/public"),
  savePublicMemory: (content: string) =>
    request<{ written: boolean }>("/auth/admin/memory/public", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  getEmployeeMemory: (profileId: number) =>
    request<{ content: string }>(`/auth/admin/memory/employee/${profileId}`),
  saveEmployeeMemory: (profileId: number, content: string) =>
    request<{ written: boolean }>(`/auth/admin/memory/employee/${profileId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  getMemoryContext: () =>
    request<{
      public_memory: string;
      private_memory: string;
      scope: string;
    }>("/auth/me/memory-context"),
  updateEmployeeProfile: (profileId: number, data: Partial<AdminUserRow>) =>
    request<{ message: string }>(`/auth/admin/users/${profileId}/profile`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateUserDepartment: (userId: number, department: string) =>
    request<{ message: string }>(`/auth/admin/users/${userId}/department`, {
      method: "POST",
      body: JSON.stringify({ department }),
    }),
};

export interface UpdateEmployeeProfilePayload extends Partial<AdminUserRow> {}

