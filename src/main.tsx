import React, { useLayoutEffect } from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { restoreTransferredDrafts } from "./app/model/windowTransfer";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  activateWindowAppearance,
  initAppearance,
} from "./features/settings/model/appearance";
import { initSounds } from "./features/settings/model/sounds";
import {
  abortQuit,
  askQuitConfirmation,
  commitQuit,
  loadBootWorkspace,
  reportQuitPoll,
} from "./app/model/appLifecycle";
import { hydrateComposerDrafts } from "./features/sessions/data/composerDraftStore";
import { homeDir, pathEnvironment } from "./platform/tauri/fs";
import { setHomeDir, setPathEnvironment } from "./shared/lib/paths";
import { consumeInstalledUpdate } from "./app/model/updateNotice";
import { initializeProviderBinaryPaths } from "./features/providers/model/providerBinaryPaths";
// Lets file commands reach a connected machine for `remote://` paths.
import "./features/connections/model/remoteCommands";
import "./styles/index.css";
import { bootstrap } from "./app/model/bootstrap";
import { BootFailure } from "./app/shell/BootFailure";
import { NoteDraftRecoveryNotice } from "./features/notes/ui/NoteDraftRecoveryNotice";

import { startPerformanceSpan, recordPerformanceEvent } from "./shared/lib/performanceTrace";

performance.mark("monocode:bootstrap");
const finishStartup = startPerformanceSpan("startup");
// Let local boot IPC overlap loading/evaluating the workspace UI.
const appLoaded = import("./app/App");

initAppearance();
initSounds();
// Prime the real home directory before the first render so every `~/` file
// reference resolves consistently. The IPC call is local and failures remain
// best-effort, falling back to inference from a session's cwd.
const homeDirPrimed = Promise.allSettled([
  homeDir().then(setHomeDir),
  pathEnvironment().then(setPathEnvironment),
]);
void initializeProviderBinaryPaths().catch(
  () => undefined,
);

function dismissBootSplash() {
  const splash = document.getElementById("boot-splash");
  if (!splash || splash.dataset.dismissed === "1") return;
  splash.dataset.dismissed = "1";
  const fade = () => {
    activateWindowAppearance();
    splash.classList.add("boot-splash-out");
    window.setTimeout(() => {
      splash.remove();
      performance.mark("monocode:ui-ready");
      performance.measure("monocode:navigation-to-ui", {
        start: 0,
        end: "monocode:ui-ready",
      });
    }, 180);
  };
  // useLayoutEffect runs before paint. Two frames later the app is on
  // screen, so the fade reveals UI instead of the desktop blur.
  requestAnimationFrame(() => {
    requestAnimationFrame(fade);
  });
}

function BootGate({
  children,
  transferred,
}: {
  children: React.ReactNode;
  transferred: boolean;
}) {
  useLayoutEffect(() => {
    dismissBootSplash();
    if (!transferred) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        void invoke("window_transfer_ready").catch(console.error);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [transferred]);
  return children;
}

void listen<number>("quit_poll", (event) => {
  void reportQuitPoll(event.payload);
});
// Scoped to this window on purpose: a global `listen` is registered as `Any`,
// which Tauri matches for every event regardless of the emitter's target, so
// one dialog would become one per window.
void getCurrentWebviewWindow().listen<{ id: number; inFlight: number }>(
  "quit_confirm",
  (event) => {
    void askQuitConfirmation(event.payload.id, event.payload.inFlight);
  },
);
void listen<number>("quit_commit", (event) => {
  void commitQuit(event.payload);
});
void listen("quit_aborted", () => {
  abortQuit();
});

const appRoot = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
// Show a bounded, safe shell while workspace and durable drafts hydrate.
// Composer remains unmounted until its draft cache is ready, preventing a
// blank draft write from racing the saved draft read.
appRoot.render(
  <BootGate transferred={false}>
    <div role="status" aria-live="polite" style={{ height: "100vh", display: "grid", placeContent: "center", gap: 12, textAlign: "center" }}>
      <strong>MonoCode</strong>
      <span>Restoring your workspace and saved drafts...</span>
      <button type="button" onClick={() => window.location.reload()}>Retry loading</button>
    </div>
  </BootGate>,
);
performance.mark("monocode:shell-ready");
recordPerformanceEvent("startup", { items: 1 });

void bootstrap(
  () =>
    Promise.all([
      homeDirPrimed,
      // Provider discovery is best-effort and may finish after UI hydration.
      Promise.resolve(),
      loadBootWorkspace(),
      // Saved drafts are in the cache before the first composer mounts.
      hydrateComposerDrafts(),
      appLoaded,
    ]),
  ([
    ,
    ,
    { windowTransfer, resumed, history, historyCwd },
    ,
    { default: App },
  ]) => {
    performance.mark("monocode:workspace-ready");
    performance.mark("monocode:input-ready");
    finishStartup();
    const installedUpdate = windowTransfer ? null : consumeInstalledUpdate();
    if (windowTransfer) restoreTransferredDrafts(windowTransfer);
    appRoot.render(
      <React.StrictMode>
        <BootGate transferred={!!windowTransfer}>
          <App
            windowTransfer={windowTransfer}
            resumed={resumed}
            installedUpdate={installedUpdate}
            history={history}
            historyCwd={historyCwd}
          />
          <NoteDraftRecoveryNotice />
        </BootGate>
      </React.StrictMode>,
    );
  },
  (error) => {
    document.getElementById("boot-splash")?.remove();
    appRoot.render(
      <BootFailure error={error} onRetry={() => window.location.reload()} />,
    );
  },
);
