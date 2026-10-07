import { ConnectionsSettings } from "../../connections/ui/ConnectionsSettings";
import { TemplatesSettings } from "./TemplatesSettings";

import { ArrowLeft, RotateCcw } from "../../../shared/ui/icons";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import "./ImeceSettings.css";

import { McpSettings } from "./McpSettings";
import { GroupLockSettings } from "../../group-lock/ui/GroupLockSettings";

import { WindowControls } from "../../../app/shell/WindowControls";
import { useLockOverscroll } from "../../../shared/hooks/useLockOverscroll";

import { IS_MAC } from "../../../platform/tauri/platform";
import { type RecentProject } from "../../projects/model/recents";

import type { SessionSummary } from "../../sessions/data/sessionStore";

import {
  SETTINGS_SECTIONS,
  settingsSectionDescription,
  settingsSectionLabel,
  type CollapsedProjectRailMode,
  type SettingsSectionId,
} from "../model/settings";

import { SkillsPage } from "../../skills/ui/SkillsPage";

import { WorktreesPage } from "../../source-control/ui/WorktreesPage";
import {
  removeWorktree,
  type RemoveWorktree,
} from "../../source-control/model/worktrees";
import type { Session } from "../../sessions/model/session";
import {
  settingDomId,
  RevealedSetting,
  PageHeader,
  Group,
  Row,
  Toggle,
  Select,
} from "./settingsControls";
import { SettingsSearch } from "./SettingsSearch";
import { GeneralPage } from "./GeneralSettings";
import { ChatPage } from "./ChatSettings";
import { InboxPage } from "./InboxSettings";
import { useAppearanceSettings } from "./useAppearanceSettings";
import { AppearancePage } from "./AppearanceSettings";
import { KeybindingsPage } from "./ShortcutSettings";
import { TerminalPage } from "./TerminalSettings";
import { ProvidersPage } from "./ProviderSettings";
import { UsagePage } from "../../usage/ui/UsagePage";
import { ArchivePage } from "./ArchiveSettings";
import { RemoteReconnectGroup } from "./ConnectionRecoverySettings";

/**
 * The `data-setting-id` Settings should reveal when it opens: one of the ids in
 * `SETTINGS_INDEX`. Inbox integrations pass their provider id.
 */
export type SettingsAnchor = string;

type Props = {
  section: SettingsSectionId;
  /** Card to scroll to; the General page is too long to land at the top. */
  anchor?: SettingsAnchor | null;
  /** Project to focus when opening notification settings from a quick action. */
  notificationProjectPath?: string | null;
  /** Changes for each quick action, including repeated requests for one project. */
  notificationSettingsRequest?: number;
  recents?: RecentProject[];
  cwd: string;
  sessions: SessionSummary[];
  liveSessions?: Session[];
  onRemoveWorktree?: RemoveWorktree;
  onCheckWorktreeRemoval?: RemoveWorktree;
  onDeleteWorktreeSessions?: (
    sessionIds: readonly string[],
  ) => Promise<boolean>;
  besideRail?: boolean;
  onClose: () => void;
  /** Lets search jump to a setting that lives on another page. */
  onSelectSection?: (section: SettingsSectionId) => void;
  onOpenSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string, archived: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
  onRestoreProject?: (path: string) => void;
  onDeleteProject?: (path: string) => void;
  onOpenWhatsNew: (version: string) => void;
  collapsedProjectRailMode?: CollapsedProjectRailMode;
  onCollapsedProjectRailModeChange?: (mode: CollapsedProjectRailMode) => void;
};

export function SettingsView({
  section,
  anchor = null,
  notificationProjectPath = null,
  notificationSettingsRequest = 0,
  recents,
  cwd,
  sessions,
  liveSessions,
  onRemoveWorktree = removeWorktree,
  onCheckWorktreeRemoval,
  onDeleteWorktreeSessions,
  besideRail = false,
  onClose,
  onSelectSection,
  onOpenSession,
  onArchiveSession,
  onDeleteSession,
  onRestoreProject,
  onDeleteProject,
  onOpenWhatsNew,
  collapsedProjectRailMode,
  onCollapsedProjectRailModeChange,
}: Props) {
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const panelId = useId();
  const categoryRefs = useRef(new Map<SettingsSectionId, HTMLButtonElement>());
  const [revealed, setRevealed] = useState<string | null>(anchor);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const appearance = useAppearanceSettings(
    collapsedProjectRailMode,
    onCollapsedProjectRailModeChange,
  );

  useEffect(() => setRevealed(anchor), [anchor, notificationSettingsRequest]);

  useEffect(() => {
    categoryRefs.current.get(section)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [section]);

  // Section is a dependency so a search result on another page scrolls once
  // that page has mounted the row.
  useEffect(() => {
    if (!revealed) return;
    // A project quick action lets the project card focus itself after discovery.
    if (!(revealed === "project-notifications" && notificationProjectPath)) {
      document
        .getElementById(settingDomId(revealed))
        ?.scrollIntoView?.({ block: "center" });
    }
    const timer = window.setTimeout(() => setRevealed(null), 1800);
    return () => window.clearTimeout(timer);
  }, [revealed, section, notificationProjectPath, notificationSettingsRequest]);

  const onReveal = useCallback(
    (next: SettingsSectionId, settingId: string | null) => {
      if (next !== section) onSelectSection?.(next);
      setRevealed(settingId);
    },
    [onSelectSection, section],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    // Let dialogs and other Settings controls handle Escape first.
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="region"
      aria-label="Settings"
      data-app-settings
      className="imece-settings imece-settings-workbench flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <div
        className="flex h-10 shrink-0 select-none items-center border-b border-stroke"
        data-tauri-drag-region="deep"
      >
        {IS_MAC && !besideRail ? <div className="w-[78px] shrink-0" /> : null}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to workspace"
            data-tauri-drag-region="false"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-content/70 hover:bg-content/10 hover:text-content"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Back to workspace</span>
          </button>
          <span className="shrink-0 text-content/60">{section === "usage" ? "Usage / This machine" : "Settings"}</span>
        </div>
        {IS_MAC ? null : <WindowControls />}
      </div>

      <header className="imece-settings-toolbar">
        <div className="imece-settings-toolbar-title">
          <span>{section === "usage" ? "Usage" : "Workspace configuration"}</span>
          <p>{section === "usage" ? "Provider limits and session activity" : "Application, agents and project preferences"}</p>
        </div>
        <div className="imece-settings-toolbar-actions">
          <SettingsSearch onReveal={onReveal} />
          {section === "appearance" ? (
            <button
              type="button"
              onClick={appearance.restoreDefaults}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-content/50 hover:bg-content/10 hover:text-content"
            >
              <RotateCcw className="size-3.5" strokeWidth={1.75} />
              Restore defaults
            </button>
          ) : null}
        </div>
      </header>

      <nav className="imece-settings-categories" role="tablist" aria-label="Settings categories">
        {SETTINGS_SECTIONS.map((category, index) => (
          <button key={category.id} ref={node => {
            if (node) categoryRefs.current.set(category.id, node);
            else categoryRefs.current.delete(category.id);
          }} type="button" role="tab" id={`${panelId}-${category.id}`}
            aria-selected={category.id === section} aria-controls={panelId}
            tabIndex={category.id === section ? 0 : -1}
            disabled={!onSelectSection && category.id !== section}
            data-category-group={category.group}
            onClick={() => onSelectSection?.(category.id)}
            onKeyDown={event => {
              if (!onSelectSection) return;
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % SETTINGS_SECTIONS.length;
              else if (event.key === "ArrowLeft") next = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = SETTINGS_SECTIONS.length - 1;
              else return;
              event.preventDefault(); event.stopPropagation();
              const target = SETTINGS_SECTIONS[next]!;
              categoryRefs.current.get(target.id)?.focus();
              onSelectSection(target.id);
            }}>
            {category.label}
          </button>
        ))}
      </nav>

      <div id={panelId} role="tabpanel" tabIndex={0} aria-labelledby={`${panelId}-${section}`} className="imece-settings-panel">

      {section === "skills" ? (
        <SkillsPage
          key={cwd}
          cwd={cwd}
          header={
            <PageHeader
              title={settingsSectionLabel(section)}
              description={settingsSectionDescription(section)}
            />
          }
        />
      ) : (
        <RevealedSetting.Provider value={revealed}>
          <div
            ref={lockOverscroll}
            className="@container/settings min-h-0 flex-1 overflow-y-auto overscroll-none"
          >
            <div data-settings-section={section} className="imece-settings-content imece-settings-form mx-auto w-full px-5 py-6 pb-16 @min-[560px]/settings:px-8 @min-[560px]/settings:py-8">
              <PageHeader
                title={settingsSectionLabel(section)}
                description={settingsSectionDescription(section)}
              />
              {section === "general" ? (
                <GeneralPage onOpenWhatsNew={onOpenWhatsNew} />
              ) : null}
              {section === "connections" ? (
                <>
                  <ConnectionsSettings />
                  <RemoteReconnectGroup />
                </>
              ) : null}
              {section === "appearance" ? (
                <AppearancePage appearance={appearance} />
              ) : null}
              {section === "chat" ? <ChatPage /> : null}
              {section === "chat" ? <TemplatesSettings /> : null}
              {section === "keybindings" ? <KeybindingsPage /> : null}
              {section === "terminal" ? <TerminalPage /> : null}
              {section === "mcp" ? (
                <McpSettings cwd={cwd} recents={recents} />
              ) : null}
              {section === "providers" ? (
                <ProvidersPage cwd={cwd} recents={recents} />
              ) : null}
              {section === "usage" ? <UsagePage /> : null}
              {section === "worktrees" ? (
                <WorktreesPage
                  cwd={cwd}
                  recents={recents}
                  liveSessions={liveSessions}
                  onRemove={onRemoveWorktree}
                  onCheckRemove={onCheckWorktreeRemoval}
                  onDeleteSessions={onDeleteWorktreeSessions}
                />
              ) : null}
              {section === "groupLock" ? (
                <GroupLockSettings controls={{ Group, Row, Toggle, Select }} />
              ) : null}
              {section === "inbox" ? (
                <InboxPage
                  cwd={cwd}
                  recents={recents}
                  notificationProjectPath={notificationProjectPath}
                  notificationSettingsRequest={notificationSettingsRequest}
                />
              ) : null}
              {section === "archive" ? (
                <ArchivePage
                  cwd={cwd}
                  sessions={sessions}
                  onOpenSession={onOpenSession}
                  onArchiveSession={onArchiveSession}
                  onDeleteSession={onDeleteSession}
                  onRestoreProject={onRestoreProject}
                  onDeleteProject={onDeleteProject}
                />
              ) : null}
            </div>
          </div>
        </RevealedSetting.Provider>
      )}
      </div>
    </div>
  );
}
