import {
  persistEmployeeNavKey,
} from "../../core/employee-navigation";
import {
  launchScene,
  type SceneConfigItem,
} from "../../core/scene/scene-launch";

const SECRETARY_CONTEXT_STORAGE = "copaw_secretary_scene_context";

export const openSecretaryWithContext = (
  navigate: (path: string) => void,
  context: string,
): void => {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(SECRETARY_CONTEXT_STORAGE, context);
  }
  navigate("/app/secretary");
};

export const openPartyScene = (args: {
  navKey: string;
  sceneKey: string;
  scene: SceneConfigItem;
  navigate: (path: string) => void;
}): void => {
  persistEmployeeNavKey(args.navKey);
  launchScene({
    key: args.sceneKey,
    scene: args.scene,
    navigate: args.navigate,
  });
};
