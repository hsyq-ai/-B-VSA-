export interface AuthBootstrapUser {
  role: "admin" | "employee";
  profile_id: number;
  user_id: number;
  name: string;
  department?: string | null;
}

export const resolveEmployeeHomePath = (department?: string | null): string => {
  const normalizedDepartment = String(department || "").trim();
  return normalizedDepartment.includes("总裁办") ? "/app/secretary" : "/app/member/tasks";
};

export const clearAuthContext = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("copaw_profile_id");
  localStorage.removeItem("copaw_role");
  localStorage.removeItem("copaw_department");
  localStorage.removeItem("copaw_user_id");
  localStorage.removeItem("copaw_user_name");
  sessionStorage.removeItem("copaw_department");
  sessionStorage.removeItem("copaw_profile_id");
  sessionStorage.removeItem("copaw_role");
  sessionStorage.removeItem("copaw_user_id");
  sessionStorage.removeItem("copaw_user_name");
  (window as any).currentUserId = "";
  (window as any).currentChannel = "console";
};

export const applyAuthContext = (me: AuthBootstrapUser): void => {
  if (typeof window === "undefined") return;
  const profileId = String(me.profile_id);
  const userId = String(me.user_id || me.profile_id);
  const userName = String(me.name || "").trim();
  const department = String(me.department || "").trim();

  localStorage.setItem("copaw_profile_id", profileId);
  sessionStorage.setItem("copaw_profile_id", profileId);
  localStorage.setItem("copaw_role", me.role);
  sessionStorage.setItem("copaw_role", me.role);
  localStorage.setItem("copaw_user_id", userId);
  sessionStorage.setItem("copaw_user_id", userId);

  if (userName) {
    localStorage.setItem("copaw_user_name", userName);
    sessionStorage.setItem("copaw_user_name", userName);
  } else {
    localStorage.removeItem("copaw_user_name");
    sessionStorage.removeItem("copaw_user_name");
  }

  if (department) {
    localStorage.setItem("copaw_department", department);
    sessionStorage.setItem("copaw_department", department);
  } else {
    localStorage.removeItem("copaw_department");
    sessionStorage.removeItem("copaw_department");
  }

  (window as any).currentUserId = profileId;
  (window as any).currentChannel = "console";
};
