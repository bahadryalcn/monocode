import { useSyncExternalStore } from "react";
import {
  loadCoffeehouseSceneEnabled,
  subscribeCoffeehouseSceneEnabled,
} from "../../settings/model/settings";
import { VillageCoffeehouseScene } from "./VillageCoffeehouseScene";
import "./ImeceSession.css";

/** Kept outside transcript scrolling so the gathering stays behind the work. */
export function CoffeehouseBackdrop({ visible = true }: { visible?: boolean }) {
  const enabled = useSyncExternalStore(
    subscribeCoffeehouseSceneEnabled,
    loadCoffeehouseSceneEnabled,
    () => true,
  );
  if (!visible || !enabled) return null;
  return <VillageCoffeehouseScene variant="background" className="imece-session-backdrop" />;
}
