import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api";
import {
  clearStoredToken,
  getStoredToken,
} from "../../../components/AuthModal";
import {
  applyAuthContext,
  clearAuthContext,
  resolveEmployeeHomePath,
} from "./auth-context";

const shouldRedirectToHome = (path: string): boolean =>
  path === "/" || path === "/chat" || path.startsWith("/chat/");

const getStoredDepartment = (): string => {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("copaw_department") || localStorage.getItem("copaw_department") || "";
};

export const useAuthBootstrap = (currentPath: string) => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean>(!!getStoredToken());
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const employeeHomePath = useMemo(
    () => resolveEmployeeHomePath(getStoredDepartment()),
    [authed, currentPath],
  );

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthed(false);
      setIsAdmin(false);
      clearAuthContext();
      if (currentPath === "/") {
        navigate("/chat", { replace: true });
      }
      return;
    }

    let cancelled = false;
    api
      .getMe()
      .then((me) => {
        if (cancelled) return;
        setAuthed(true);
        setIsAdmin(me.role === "admin");
        applyAuthContext({
          role: me.role,
          profile_id: me.profile_id,
          user_id: me.user_id,
          name: me.name,
          department: me.department,
        });

        if (!shouldRedirectToHome(currentPath)) return;
        if (me.role === "admin") {
          navigate("/manager", { replace: true });
          return;
        }
        navigate(resolveEmployeeHomePath(me.department), { replace: true });
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredToken();
        setAuthed(false);
        setIsAdmin(false);
        clearAuthContext();
        navigate("/chat", { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [authed, currentPath, navigate]);

  const handleAuthenticated = () => {
    setAuthed(true);
  };

  const handleLogout = () => {
    clearStoredToken();
    setAuthed(false);
    setIsAdmin(false);
    clearAuthContext();
    navigate("/chat", { replace: true });
  };

  return {
    authed,
    isAdmin,
    employeeHomePath,
    handleAuthenticated,
    handleLogout,
  };
};
