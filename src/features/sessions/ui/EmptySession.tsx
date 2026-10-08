import { t, useLocale } from "../../../shared/i18n";
import { type ReactNode, useSyncExternalStore } from "react";
import { basename } from "../../../platform/tauri/fs";
import { projectKey } from "../../../shared/lib/paths";
import { looksLikeProject } from "../../projects/model/recents";
import {
  loadTabGroupLabels,
  resolveTabGroupLabel,
  subscribeTabGroupLabels,
} from "../../workspace/model/tabGroups";
import {
  loadCoffeehouseSceneEnabled,
  subscribeCoffeehouseSceneEnabled,
} from "../../settings/model/settings";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";
import { VillageCoffeehouseScene } from "./VillageCoffeehouseScene";
import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import "./ImeceSession.css";

type Props = {
  cwd: string;
  composer?: ReactNode;
  hasChatBackground?: boolean;
};

export function EmptySession({ cwd, composer, hasChatBackground }: Props) {
  useLocale();
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const coffeehouseEnabled = useSyncExternalStore(
    subscribeCoffeehouseSceneEnabled,
    loadCoffeehouseSceneEnabled,
    () => true,
  );
  const getProjectLabel = () =>
    looksLikeProject(cwd)
      ? resolveTabGroupLabel(
          projectKey(cwd),
          loadTabGroupLabels(),
          basename(cwd),
        )
      : null;
  const project = useSyncExternalStore(
    subscribeTabGroupLabels,
    getProjectLabel,
    getProjectLabel,
  );
  const title = project
    ? t("Work on {p0}.", { p0: project })
    : t("Start a new task.");

  return (
    <div
      ref={lockOverscroll}
      className="imece-empty relative flex h-full min-h-0 overflow-y-auto overscroll-none"
    >
      {composer ? (
        // Same box as the docked composer (max-w-4xl, p-1.5), so the input
        // keeps its width when the first message docks it.
        <div className="imece-entry-workbench pointer-events-none relative z-10 mx-auto flex w-full flex-1 flex-col">
          <div className="imece-entry-heading">
            <div className="imece-wordmark">
              <img src={PRODUCT_IDENTITY.logoSrc} alt="" />
              <span>{PRODUCT_IDENTITY.displayName}</span>
            </div>
            <span className="imece-entry-context" title={cwd}> {project ?? t("Workspace")}{t(" / new task")}</span>
          </div>
          <div className="imece-task-brief pointer-events-auto">
            <h1
              className="text-content"
              title={project ? cwd : undefined}
            >
              {title}
            </h1>
            <p>{t("Set the objective, select your tools, and review the changes in your workspace.")}</p>
          </div>

          <div className="imece-entry-composer pointer-events-auto w-full">{composer}</div>
          {coffeehouseEnabled && !hasChatBackground ? <VillageCoffeehouseScene /> : null}
        </div>
      ) : null}
    </div>
  );
}
