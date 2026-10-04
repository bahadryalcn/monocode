import { ArrowDownCircle, Loader, RefreshCw } from "../../../shared/ui/icons";
import { useEffect, useState, useSyncExternalStore } from "react";

import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { OPEN_SESSION_IMPORT_EVENT } from "../../sessions/import/importModel";

import { IS_MAC, IS_WIN } from "../../../platform/tauri/platform";

import {
  loadCloseToTray,
  loadFileTabMode,
  KEEP_AWAKE_HOLD_AFTER,
  KEEP_AWAKE_HOLD_AFTER_DEFAULT,
  isKeepAwakeHoldAfter,
  loadKeepAwakeEnabled,
  loadKeepAwakeHoldAfter,
  loadKeepAwakeScreen,
  loadLiveAgentsEnabled,
  loadNotesEnabled,
  loadQuickComposerEnabled,
  loadQuickComposerShortcut,
  loadTabAnimationsEnabled,
  saveCloseToTray,
  saveFileTabMode,
  saveKeepAwakeEnabled,
  saveKeepAwakeHoldAfter,
  saveKeepAwakeScreen,
  saveLiveAgentsEnabled,
  saveNotesEnabled,
  saveQuickComposerEnabled,
  subscribeKeepAwakeEnabled,
  subscribeKeepAwakeHoldAfter,
  subscribeKeepAwakeScreen,
  saveTabAnimationsEnabled,
  type FileTabMode,
} from "../model/settings";
import { loadSoundsEnabled, saveSoundsEnabled } from "../model/sounds";
import { setQuickComposerShortcut } from "../../quick-composer/model/quickComposer";
import { quickComposerShortcutLabel } from "../../quick-composer/model/quickComposerShortcut";
import {
  cachedNotificationPermission,
  loadNotificationsEnabled,
  openNotificationSettings,
  probeNotificationPermission,
  requestNotificationPermission,
  saveNotificationsEnabled,
  type NotificationPermission,
} from "../../notifications/model/notifications";
import {
  NOTIFICATION_EVENT_SETTINGS,
  loadNotificationEvents,
  saveNotificationEvent,
} from "../../notifications/model/notificationEvents";
import {
  DAILY_SUMMARY_TIMES,
  loadDailySummaryEnabled,
  loadDailySummaryTime,
  saveDailySummaryEnabled,
  saveDailySummaryTime,
} from "../../notifications/model/dailySummarySettings";
import {
  installPendingUpdate,
  isUpdaterEnabled,
  readAppVersion,
  runUpdateFlow,
  type UpdaterSnapshot,
} from "../../../app/model/updater";

import { Group, Row, Segmented, Toggle, Select } from "./settingsControls";

export function GeneralPage({
  onOpenWhatsNew,
}: {
  onOpenWhatsNew: (version: string) => void;
}) {
  const [soundsEnabled, setSoundsEnabled] = useState(loadSoundsEnabled);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    loadNotificationsEnabled,
  );
  const [notificationEvents, setNotificationEvents] = useState(
    loadNotificationEvents,
  );
  const [summaryEnabled, setSummaryEnabled] = useState(loadDailySummaryEnabled);
  const [summaryTime, setSummaryTime] = useState(loadDailySummaryTime);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(cachedNotificationPermission);
  const [notesEnabled, setNotesEnabled] = useState(loadNotesEnabled);
  const [liveAgentsEnabled, setLiveAgentsEnabled] = useState(
    loadLiveAgentsEnabled,
  );
  const [fileTabMode, setFileTabMode] = useState<FileTabMode>(loadFileTabMode);
  const [tabAnimationsEnabled, setTabAnimationsEnabled] = useState(
    loadTabAnimationsEnabled,
  );
  const [closeToTray, setCloseToTray] = useState(loadCloseToTray);
  const keepAwake = useSyncExternalStore(
    subscribeKeepAwakeEnabled,
    loadKeepAwakeEnabled,
    () => false,
  );
  const keepAwakeHoldAfter = useSyncExternalStore(
    subscribeKeepAwakeHoldAfter,
    loadKeepAwakeHoldAfter,
    () => KEEP_AWAKE_HOLD_AFTER_DEFAULT,
  );
  const keepAwakeScreen = useSyncExternalStore(
    subscribeKeepAwakeScreen,
    loadKeepAwakeScreen,
    () => false,
  );
  const [quickComposerEnabled, setQuickComposerEnabled] = useState(
    loadQuickComposerEnabled,
  );
  const [quickComposerError, setQuickComposerError] = useState<string | null>(
    null,
  );

  // The user may flip the switch in System Settings and come back: re-read
  // the OS state whenever the window regains focus while the toggle is on.
  useEffect(() => {
    if (!notificationsEnabled) return;
    const refresh = () => {
      void probeNotificationPermission().then(setNotificationPermission);
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [notificationsEnabled]);

  const onSoundsEnabled = (next: boolean) => {
    saveSoundsEnabled(next);
    setSoundsEnabled(next);
  };

  const onNotificationsEnabled = (next: boolean) => {
    saveNotificationsEnabled(next);
    setNotificationsEnabled(next);
    if (!next) return;
    void requestNotificationPermission().then(setNotificationPermission);
  };

  const onNotesEnabled = (next: boolean) => {
    saveNotesEnabled(next);
    setNotesEnabled(next);
  };

  const onQuickComposerEnabled = (next: boolean) => {
    saveQuickComposerEnabled(next);
    setQuickComposerEnabled(next);
    setQuickComposerError(null);
    void setQuickComposerShortcut(next).catch((error: unknown) => {
      // Another app already owns the combination. Leave the switch where the
      // user put it so the next launch tries again, but say why it is dead.
      setQuickComposerError(String(error));
    });
  };

  const onLiveAgentsEnabled = (next: boolean) => {
    saveLiveAgentsEnabled(next);
    setLiveAgentsEnabled(next);
  };

  const onFileTabMode = (next: FileTabMode) => {
    saveFileTabMode(next);
    setFileTabMode(next);
  };

  const onTabAnimationsEnabled = (next: boolean) => {
    saveTabAnimationsEnabled(next);
    setTabAnimationsEnabled(next);
  };

  const onCloseToTray = (next: boolean) => {
    saveCloseToTray(next);
    setCloseToTray(next);
  };

  const onKeepAwake = (next: boolean) => {
    saveKeepAwakeEnabled(next);
  };

  const onKeepAwakeHoldAfter = (next: string) => {
    if (isKeepAwakeHoldAfter(next)) saveKeepAwakeHoldAfter(next);
  };

  const onKeepAwakeScreen = (next: boolean) => {
    saveKeepAwakeScreen(next);
  };

  return (
    <>
      <Group
        title="Alerts"
        description="How MonoCode reaches you while you are looking somewhere else."
      >
        <Row
          id="sounds"
          label="Sounds"
          description="Short cues for project activity, finished turns, and available updates. Choose project notification categories in Inbox settings. Switches and Copy on a finished turn also play."
        >
          <Toggle
            label="Sounds"
            on={soundsEnabled}
            onChange={onSoundsEnabled}
          />
        </Row>
        <Row
          id="notifications"
          label="Notifications"
          description="Notify when a reminder is due, or when an agent finishes or needs input in another session or while MonoCode is in the background. Click the notification to open that session."
        >
          {notificationsEnabled && notificationPermission === "denied" ? (
            <NotificationsBlocked />
          ) : null}
          {notificationsEnabled && notificationPermission === "unsupported" ? (
            <span className="text-[12px] text-content/45">
              Not available on this platform
            </span>
          ) : null}
          <Toggle
            label="Notifications"
            on={notificationsEnabled}
            onChange={onNotificationsEnabled}
          />
        </Row>
        {notificationsEnabled
          ? NOTIFICATION_EVENT_SETTINGS.map((event) => (
              <Row
                key={event.id}
                label={event.label}
                description={event.description}
              >
                <Toggle
                  label={event.label}
                  on={notificationEvents[event.id]}
                  onChange={(on) => {
                    saveNotificationEvent(event.id, on);
                    setNotificationEvents(loadNotificationEvents());
                  }}
                />
              </Row>
            ))
          : null}
        {notificationsEnabled ? (
          <Row
            id="daily-summary"
            label="Daily summary"
            description="Once a day, one notification with what background tasks and goals did on every machine. Click it to open the summary."
          >
            {summaryEnabled ? (
              <Select
                label="Daily summary time"
                value={summaryTime}
                options={DAILY_SUMMARY_TIMES.map((time) => ({
                  value: time,
                  label: time,
                }))}
                onChange={(time) => {
                  saveDailySummaryTime(time);
                  setSummaryTime(time);
                }}
              />
            ) : null}
            <Toggle
              label="Daily summary"
              on={summaryEnabled}
              onChange={(on) => {
                saveDailySummaryEnabled(on);
                setSummaryEnabled(on);
              }}
            />
          </Row>
        ) : null}
      </Group>

      <Group
        title="Workspace"
        description="How project navigation and workspace tabs behave."
      >
        <Row
          id="file-tabs"
          label="File tabs"
          description="Open files beside the active chat, or give each file a normal tab in the top bar. Top-bar files can still be combined into split panes."
        >
          <Segmented
            label="File tabs"
            value={fileTabMode}
            options={[
              { value: "pane", label: "Beside chat" },
              { value: "workspace", label: "Top bar" },
            ]}
            onChange={onFileTabMode}
          />
        </Row>
        <Row
          id="tab-animations"
          label="Tab animations"
          description="Animate tabs as they open and close. Turn this off for instant tab changes."
        >
          <Toggle
            label="Tab animations"
            on={tabAnimationsEnabled}
            onChange={onTabAnimationsEnabled}
          />
        </Row>
        <Row
          id="notes"
          label="Notes"
          description="A global markdown notebook on the project rail. Save a finished turn from the transcript, then mention it later with @note or add it to chat."
        >
          <Toggle label="Notes" on={notesEnabled} onChange={onNotesEnabled} />
        </Row>
        {IS_MAC && (
          <Row
            id="quick-composer"
            label="Quick composer"
            description={`Press ${quickComposerShortcutLabel(loadQuickComposerShortcut())} in any app to float a prompt over it and start a session without switching to MonoCode. Change the shortcut in Keybindings. Return starts it in the background; ⌘Return starts it and brings the session forward.`}
          >
            {quickComposerError ? (
              <span className="text-[12px] text-content/45">
                {quickComposerError}
              </span>
            ) : null}
            <Toggle
              label="Quick composer"
              on={quickComposerEnabled}
              onChange={onQuickComposerEnabled}
            />
          </Row>
        )}
        <Row
          id="working-agents"
          label="Working agents"
          description="A card on the project rail lists working or just-finished chats you are not looking at, so you can jump across projects. Finished turns stay until you open that session."
        >
          <Toggle
            label="Working agents"
            on={liveAgentsEnabled}
            onChange={onLiveAgentsEnabled}
          />
        </Row>
        {IS_WIN && (
          <Row
            id="close-to-tray"
            label="Close to tray"
            description="Closing a window hides it to the system tray instead of quitting, so running agents keep going. Reopen from the tray icon, and quit for real from its menu. Turn this off to have close end the window."
          >
            <Toggle
              label="Close to tray"
              on={closeToTray}
              onChange={onCloseToTray}
            />
          </Row>
        )}
      </Group>

      <Group
        title="Sleep"
        description="Keep this computer awake while an agent is working."
      >
        <Row
          id="keep-awake"
          label="Prevent sleep while agents work"
          description={
            IS_WIN
              ? "Prevent idle sleep during agent work, and optionally after the last agent finishes. Closing the lid or choosing Sleep still works. On battery-powered Modern Standby PCs, Windows may stop the request five minutes after the sleep timeout."
              : IS_MAC
                ? "Prevent idle sleep during agent work, and optionally after the last agent finishes. Closing the lid or choosing Sleep still works."
                : "Prevent idle sleep during agent work, and optionally after the last agent finishes. Automatic screen locking remains available. On GNOME, choosing Sleep may be blocked while this is active."
          }
        >
          <Select
            label="Stay awake after an agent ends"
            value={keepAwakeHoldAfter}
            options={[...KEEP_AWAKE_HOLD_AFTER]}
            onChange={onKeepAwakeHoldAfter}
          />
          <Toggle
            label="Prevent sleep while agents work"
            on={keepAwake}
            onChange={onKeepAwake}
          />
        </Row>
        <Row
          id="keep-awake-screen"
          label="Keep the screen on"
          description={
            IS_WIN || IS_MAC
              ? "Keep the display awake while the sleep setting is active. Closing the lid or choosing Sleep still works."
              : "Keep the display awake while the sleep setting is active. Automatic screen locking may be prevented."
          }
        >
          <Toggle
            label="Keep the screen on"
            on={keepAwakeScreen}
            onChange={onKeepAwakeScreen}
            disabled={!keepAwake}
          />
        </Row>
      </Group>

      <Group
        id="import-history"
        title="Import history"
        description="Bring conversations you had in the Claude Code and Codex terminals into MonoCode."
      >
        <Row
          label="Claude Code and Codex sessions"
          description="Lists what is on this computer by folder. Nothing is imported until you choose it, and the originals are never changed."
        >
          <SecondaryButton
            onClick={() =>
              window.dispatchEvent(new Event(OPEN_SESSION_IMPORT_EVENT))
            }
          >
            Import…
          </SecondaryButton>
        </Row>
      </Group>

      <Group title="About">
        <UpdateRow onOpenWhatsNew={onOpenWhatsNew} />
      </Group>
    </>
  );
}

export function UpdateRow({
  onOpenWhatsNew,
}: {
  onOpenWhatsNew: (version: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<UpdaterSnapshot>({
    phase: "idle",
    currentVersion: "…",
  });

  // Unknown until the identifier resolves; only the official build updates.
  const [updatesEnabled, setUpdatesEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readAppVersion().then((currentVersion) => {
      if (cancelled) return;
      setSnapshot((current) => ({ ...current, currentVersion }));
    });
    void isUpdaterEnabled().then((enabled) => {
      if (!cancelled) setUpdatesEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const busy =
    snapshot.phase === "checking" || snapshot.phase === "downloading";
  const hasUpdate = snapshot.phase === "available";

  const onClick = async () => {
    if (busy) return;
    if (hasUpdate) {
      await installPendingUpdate(setSnapshot);
      return;
    }
    await runUpdateFlow(true, setSnapshot);
  };

  const status =
    updatesEnabled === false
      ? "Automatic updates are disabled in this build."
      : snapshot.phase === "available"
        ? `Version ${snapshot.availableVersion} is available.`
        : snapshot.phase === "downloading"
          ? `Downloading${snapshot.progress != null ? ` ${snapshot.progress}%` : "…"}`
          : snapshot.phase === "checking"
            ? "Checking for updates…"
            : snapshot.phase === "current"
              ? "You're on the latest version."
              : snapshot.phase === "error"
                ? (snapshot.error ?? "Update check failed.")
                : "MonoCode updates itself from the release feed.";

  return (
    <Row
      id="update"
      label={
        <span className="flex items-baseline gap-2">
          Version
          <span className="font-mono text-[12px] text-content/45">
            {snapshot.currentVersion}
          </span>
        </span>
      }
      description={status}
    >
      <div className="flex items-center gap-2">
        <SecondaryButton
          onClick={() => onOpenWhatsNew(snapshot.currentVersion)}
          disabled={snapshot.currentVersion === "…"}
        >
          What's new
        </SecondaryButton>
        {updatesEnabled === false ? null : (
          <SecondaryButton onClick={() => void onClick()} disabled={busy}>
            {busy ? (
              <Loader className="size-3.5 animate-spin" aria-hidden />
            ) : hasUpdate ? (
              <ArrowDownCircle className="size-3.5 text-accent" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
            )}
            {hasUpdate ? "Download" : "Check for updates"}
          </SecondaryButton>
        )}
      </div>
    </Row>
  );
}

/** macOS keeps the decision after the first prompt; only System Settings can flip it. Windows toasts are governed by Settings > Notifications. */
export function NotificationsBlocked() {
  return (
    <span className="flex items-center gap-2 text-[12px] text-content/45">
      Permission needed
      {IS_MAC || IS_WIN ? (
        <button
          type="button"
          onClick={() => {
            void openNotificationSettings().catch(() => {});
          }}
          className="rounded-md border border-content/10 px-2 py-1 text-content/70 hover:bg-content/10 hover:text-content"
        >
          Open System Settings
        </button>
      ) : null}
    </span>
  );
}
