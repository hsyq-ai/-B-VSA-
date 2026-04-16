export interface SceneConfigItem {
  label: string;
  triggerKey: string;
  sessionName?: string;
  prompt?: string;
  context?: Record<string, string>;
  skill?: string;
  templateType?: "scene" | "skill";
  agentKey?: string;
  runtimeProfile?: "standard" | "isolated";
}

export const EMPLOYEE_SCENE_STORAGE = "copaw_scene_start_v1";

export const persistSceneLaunchPayload = (
  key: string,
  scene: SceneConfigItem,
  ts = Date.now(),
): number => {
  if (typeof window === "undefined") return ts;
  sessionStorage.setItem(
    EMPLOYEE_SCENE_STORAGE,
    JSON.stringify({
      key,
      label: scene.label,
      triggerKey: scene.triggerKey,
      context: scene.context || {},
      sessionName: scene.sessionName,
      prompt: scene.prompt || "",
      skill: scene.skill || "",
      templateType: scene.templateType || "scene",
      agentKey: scene.agentKey || "",
      runtimeProfile: scene.runtimeProfile || "standard",
      ts,
    }),
  );
  return ts;
};

export const resolveSceneLaunchPath = (key: string, ts: number): string => {
  if (key.startsWith("digital-scene-") || key.startsWith("digital-fallback-")) {
    return `/app/expert/${encodeURIComponent(key)}?t=${ts}`;
  }
  if (key.startsWith("enterprise-dept-emp-") || key.startsWith("employee-center-chat-")) {
    return `/app/employee/${encodeURIComponent(key)}?t=${ts}`;
  }
  return `/app/workspace?scene=${encodeURIComponent(key)}&t=${ts}`;
};

export const launchScene = (args: {
  key: string;
  scene: SceneConfigItem;
  navigate: (path: string) => void;
}): number => {
  const ts = persistSceneLaunchPayload(args.key, args.scene);
  args.navigate(resolveSceneLaunchPath(args.key, ts));
  return ts;
};
