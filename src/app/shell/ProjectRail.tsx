import {
  AlertCircle,
  Archive,
  BellOff,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  GitBranch,
  Internet,
  Inbox,
  Link as LinkIcon,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pin,
  PinOff,
  File,
  Plus,
  Search,
  Settings,
  Zap,
  DashboardSquare,
} from "../../shared/ui/icons";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useDragResize } from "../../shared/hooks/useDragResize";
import { useLockOverscroll } from "../../shared/hooks/useLockOverscroll";
import {
  useProjectDiffStats,
  useProjectsDiffStats,
} from "../../features/source-control/hooks/useProjectDiffStats";
import { useAnimatedReorder } from "../../shared/hooks/useAnimatedReorder";
import { useTabGroupLogos } from "../../features/projects/hooks/useTabGroupLogos";
import {
  loadProjectRailWidth,
  PROJECT_RAIL_WIDTH_DEFAULT,
  PROJECT_RAIL_WIDTH_MAX,
  PROJECT_RAIL_WIDTH_MIN,
  saveProjectRailWidth,
} from "../../features/settings/model/appearance";
import {
  basename,
  type GitDiffStats,
} from "../../platform/tauri/fs";
import { IS_MAC, MOD } from "../../platform/tauri/platform";
import { formatInteger } from "../../shared/lib/numbers";
import { pathKey, projectKey, projectName } from "../../shared/lib/paths";
import {
  collectRailProjects,
  isLocalProject,
  loadPinnedProjects,
  loadRecents,
  newProjectPaths,
  loadProjectRailOrder,
  projectRailSections,
  sameProjectPath,
  savePinnedProjects,
  saveProjectRailOrder,
  subscribeProjectPathsChanged,
  syncProjectRailOrder,
  toggleProjectPin,
  type RecentProject,
} from "../../features/projects/model/recents";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupLabels,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupLabel,
  resolveTabGroupLogo,
  resolveTabGroupMascot,
} from "../../features/workspace/model/tabGroups";
import {
  loadProjectGroupAssignments,
  changeProjectGroupMembers,
  loadProjectGroups,
  moveProjectGroup,
  projectGroupColor,
  projectGroupIdForPath,
  reorderProjectGroups,
  updateProjectGroup,
  type ProjectGroup,
} from "../../features/projects/model/projectGroups";
import {
  shouldShowLiveAgents,
  type LiveAgent,
} from "../../features/sessions/model/liveAgents";
import { LiveAgentsPreview } from "../../features/sessions/ui/LiveAgentsPreview";
import { ProjectLogoIcon } from "../../features/projects/ui/ProjectLogoIcon";
import { ProjectMascot } from "../../features/projects/ui/ProjectMascot";
import { RailAction, RailSearch } from "./RailAction";
import { remoteOnlyProjects, type RemoteOnlyProject } from "../../features/sync/model/syncProjects";
import { remoteOnlyProjectHint, remoteOpenMatch } from "../../features/sync/model/syncRemoteProjects";
import { LastSessionsSection, type RecentSessionsSource } from "./LastSessionsSection";
import { DevModeSlot, TabVisitNav } from "./TitleBar";
import { SidebarUpdateFooter } from "./SidebarUpdate";
import type { InstalledUpdate } from "../model/updateNotice";
import { SettingsNav } from "./SettingsRail";
import { Shimmer } from "../../shared/ui/Shimmer";
import type { SettingsSectionId } from "../../features/settings/model/settings";
import { InboxNotificationMenu } from "../../features/inbox/ui/InboxNotificationMenu";
import { notificationMuteStatus } from "../../features/notifications/ui/notificationMuteActions";
import { useProjectNotificationPreferences } from "../../features/notifications/hooks/useProjectNotificationPreferences";
import { useNotificationProjects } from "../../features/notifications/hooks/useNotificationProjects";
import { GithubStarPrompt } from "./GithubStarPrompt";
import { Popover } from "../../shared/ui/Popover";
import { OPEN_REMOTE_PROJECT_EVENT } from "../../features/connections/model/connections";
import { OPEN_CODE_WORKSPACE_EVENT } from "../../features/projects/model/codeWorkspace";
import { OPEN_SESSION_IMPORT_EVENT } from "../../features/sessions/import/importModel";
import {
  useRemoteMachineOnline,
  useRemoteMachines,
} from "../../features/connections/model/connections";
import { remoteProjectFor } from "../../features/connections/model/remoteProjects";
import { connectionIndicator } from "../../features/connections/model/remoteConnection";
import { useRemoteConnection } from "../../features/connections/model/useRemoteConnection";
import { useProjectMenu } from "./useProjectMenu";
import { GroupGitPopover } from "../../features/projects/ui/GroupGitPopover";
import { OPEN_PROJECT_CHANGES_EVENT, summarizeGroupGit } from "../../features/projects/model/groupGit";
import { useLinkedGroupStatus } from "../../features/projects/model/linkedWorkspace";
import { useGroupLock } from "../../features/group-lock/hooks/useGroupLock";
import { isProjectLockedIn } from "../../features/group-lock/model/lockState";
import type { RailSectionId } from "../../features/projects/model/railSections";
import {
  keepFocus,
  moveStepForKey,
  RAIL_DRAG_HANDLE,
  RAIL_SECTION_HEADER,
  SectionMenuButton,
  useRailSections,
  type RailSectionDrag,
} from "./useRailSections";

/** The macOS window buttons take the top 78px, plus room for the panel toggle. */
const PROJECT_RAIL_MAC_MIN = 112;

// The rail goes icon-only below PROJECT_RAIL_COMPACT_WIDTH (140px). That is a
// container query on `@container/rail`, so it follows a drag with no re-render.
// Tailwind needs the classes written out: spell it `@max-[140px]/rail:`.

type Props = {
  visible?: boolean;
  cwd: string;
  recents: RecentProject[];
  inboxUnseen?: boolean;
  busyPaths?: Iterable<string>;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onSearch?: () => void;
  searchActive?: boolean;
  onOpenInbox?: () => void;
  inboxActive?: boolean;
  notesEnabled?: boolean;
  onOpenNotes?: () => void;
  notesActive?: boolean;
  onOpenAutomations?: () => void;
  onOpenTasks?: () => void;
  automationsActive?: boolean;
  tasksActive?: boolean;
  onTogglePanel?: () => void;
  onSelectProject: (path: string) => void;
  onOpenProject: () => void | Promise<void>;
  /** Lets the user pick this machine's folder for a project only another machine has. */
  onOpenSyncedProject?: (projectId: string, name: string) => void | Promise<void>;
  onRemoveProject?: (path: string, options: { purgeData: boolean }) => void;
  liveAgents?: LiveAgent[];
  activeSessionId?: string;
  onSelectAgent?: (sessionId: string) => void;
  recentSessions?: RecentSessionsSource;
  settingsOpen?: boolean;
  settingsSection?: SettingsSectionId;
  onOpenSettings?: () => void;
  onOpenNotificationSettings?: (projectPath?: string) => void;
  onSelectSettingsSection?: (section: SettingsSectionId) => void;
  onCloseSettings?: () => void;
  updateNotice?: InstalledUpdate | null;
  onOpenWhatsNew?: (version: string) => void;
  onDismissUpdate?: () => void;
};

export function ProjectRail({
  visible = true,
  cwd,
  recents,
  inboxUnseen = false,
  busyPaths,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
  onSearch,
  searchActive = false,
  onOpenInbox,
  inboxActive = false,
  notesEnabled = true,
  onOpenNotes,
  notesActive = false,
  onOpenAutomations,
  onOpenTasks,
  automationsActive = false,
  tasksActive = false,
  onTogglePanel,
  onSelectProject,
  onOpenProject,
  onOpenSyncedProject,
  onRemoveProject,
  liveAgents = [],
  activeSessionId,
  onSelectAgent,
  recentSessions,
  settingsOpen = false,
  settingsSection = "general",
  onOpenSettings,
  onOpenNotificationSettings,
  onSelectSettingsSection,
  onCloseSettings,
  updateNotice = null,
  onOpenWhatsNew,
  onDismissUpdate,
}: Props) {
  const resize = useDragResize({
    min: IS_MAC ? PROJECT_RAIL_MAC_MIN : PROJECT_RAIL_WIDTH_MIN,
    max: () =>
      Math.min(PROJECT_RAIL_WIDTH_MAX, Math.floor(window.innerWidth * 0.35)),
    defaultWidth: PROJECT_RAIL_WIDTH_DEFAULT,
    initial: loadProjectRailWidth(),
    onCommit: saveProjectRailWidth,
  });
  const [railOrder, setRailOrder] = useState(loadProjectRailOrder);
  const [pinnedPaths, setPinnedPaths] = useState(loadPinnedProjects);
  const [groupLabels, setGroupLabels] = useState(loadTabGroupLabels);
  const [groupColors, setGroupColors] = useState(loadTabGroupColors);
  const [groupMascots, setGroupMascots] = useState(loadTabGroupMascots);
  const [groupCustomColors, setGroupCustomColors] = useState(
    loadTabGroupCustomColors,
  );
  const [projectGroups, setProjectGroups] = useState(loadProjectGroups);
  const [projectGroupAssignments, setProjectGroupAssignments] = useState(
    loadProjectGroupAssignments,
  );
  const [remoteOnly, setRemoteOnly] = useState<RemoteOnlyProject[]>(remoteOnlyProjects);
  useEffect(() => {
    const reload = () => {
      setRemoteOnly(remoteOnlyProjects());
      setRailOrder(loadProjectRailOrder());
      setPinnedPaths(loadPinnedProjects());
      setGroupLabels(loadTabGroupLabels());
      setGroupColors(loadTabGroupColors());
      setGroupMascots(loadTabGroupMascots());
      setGroupCustomColors(loadTabGroupCustomColors());
      setProjectGroups(loadProjectGroups());
      setProjectGroupAssignments(loadProjectGroupAssignments());
    };
    const unsubscribe = subscribeProjectPathsChanged(reload);
    // Another window moved a group or a project: its writes arrive as storage events.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith("monocode.project")) reload();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const [lastSessionsShown, setLastSessionsShown] = useState(false);
  const [inboxMenu, setInboxMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Scrolls a project's row into view. A row inside a collapsed group is not
  // rendered, so this does nothing there and never expands anything.
  const revealProject = (path: string) => {
    requestAnimationFrame(() => {
      const root = scrollRef.current;
      // Never move the list under a drag-reorder in progress.
      if (!root || root.querySelector("[data-dragging]")) return;
      for (const row of root.querySelectorAll<HTMLElement>("[data-project-path]")) {
        if (!sameProjectPath(row.dataset.projectPath ?? "", path)) continue;
        const reduce = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        row.scrollIntoView({
          block: "nearest",
          behavior: reduce ? "auto" : "smooth",
        });
        return;
      }
    });
  };
  // The folder picker reports nothing back, so compare the remembered projects
  // before and after: a cancelled pick adds none and changes nothing.
  const addProjectToGroup = (groupId: string) => {
    const before = loadRecents().map((item) => item.path);
    void (async () => {
      try {
        await onOpenProject();
      } catch {
        return;
      }
      const added = newProjectPaths(before, loadRecents().map((item) => item.path));
      if (added.length === 0) return;
      changeProjectGroupMembers(groupId, added, []);
      updateProjectGroup(groupId, (current) => ({ ...current, collapsed: false }));
      revealProject(added[added.length - 1]);
    })();
  };
  const projectMenu = useProjectMenu({
    onRemoveProject,
    onOpenNotificationSettings,
    onAddProjectToGroup: addProjectToGroup,
    onOpen: () => setInboxMenu(null),
  });
  useEffect(() => {
    if (visible) return;
    projectMenu.dismiss();
    setInboxMenu(null);
  }, [visible]);
  const notificationPreferences = useProjectNotificationPreferences();
  const allProjects = useMemo(
    () => collectRailProjects(recents, cwd),
    [cwd, recents],
  );
  // Projects in a locked group stay in `allProjects` so their saved order and
  // pins survive, but nothing below lists them while the group is locked.
  const { lock } = useGroupLock();
  const railProjectKeys = useMemo(
    () => new Set([...allProjects.keys()].filter((key) => !lock.lockedProjectKeys.has(key))),
    [allProjects, lock],
  );
  const visibleLiveAgents = useMemo(
    () => liveAgents.filter((agent) => !isProjectLockedIn(lock, agent.cwd)),
    [liveAgents, lock],
  );
  const notificationProjects = useNotificationProjects([...allProjects.keys()]);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const lockOverscroll = useLockOverscroll<HTMLDivElement>();
  const groupLogos = useTabGroupLogos();
  const muteStatuses = new Map<string, string | null>();
  for (const project of notificationProjects.projects) {
    const status = notificationMuteStatus(notificationPreferences[project.id]);
    for (const path of project.paths) muteStatuses.set(pathKey(path), status);
  }
  const sections = useMemo(
    () => projectRailSections(recents, cwd, railOrder, pinnedPaths),
    [cwd, pinnedPaths, railOrder, recents],
  );
  const pinnedProjects = useMemo(
    () => sections.pinned.filter((item) => !isProjectLockedIn(lock, item.path)),
    [lock, sections.pinned],
  );
  const groupedProjectSections = useMemo(() => {
    const byGroup = new Map<string, RecentProject[]>(
      projectGroups.map((group) => [group.id, []]),
    );
    const ungrouped: RecentProject[] = [];
    for (const project of sections.projects) {
      const groupId = projectGroupIdForPath(
        project.path,
        projectGroupAssignments,
      );
      const items = groupId ? byGroup.get(groupId) : undefined;
      if (items) items.push(project);
      else ungrouped.push(project);
    }
    return {
      ungrouped,
      grouped: projectGroups.map((group) => ({
        group,
        locked: lock.lockedGroupIds.has(group.id),
        items: lock.lockedGroupIds.has(group.id)
          ? []
          : (byGroup.get(group.id) ?? []),
      })),
    };
  }, [lock, projectGroupAssignments, projectGroups, sections.projects]);
  const busy = useMemo(() => {
    const set = new Set<string>();
    for (const path of busyPaths ?? []) set.add(path);
    return set;
  }, [busyPaths]);

  useEffect(() => {
    setRailOrder((prev) => {
      const synced = syncProjectRailOrder(prev, allProjects);
      if (synced.join("\0") === prev.join("\0")) return prev;
      saveProjectRailOrder(synced);
      return synced;
    });
  }, [allProjects]);

  useEffect(() => {
    // Saving announces the change, which reloads `pinnedPaths`.
    const pinned = loadPinnedProjects();
    const next = pinned.filter((path) => allProjects.has(path));
    if (next.length !== pinned.length) savePinnedProjects(next);
  }, [allProjects]);

  // Follow the active project. Adding a project makes it the active one, so a
  // new row (it lands in "Projects", below every group) is brought into view
  // too. Keyed on the project, so scrolling by hand is left alone.
  useEffect(() => {
    if (!visible || !cwd) return;
    revealProject(cwd);
  }, [cwd, visible]);

  useEffect(() => {
    if (!projectMenu.isOpen) return;
    const onScroll = () => projectMenu.close();
    const scrollParent = scrollRef.current ?? window;
    scrollParent.addEventListener("scroll", onScroll, true);
    return () => scrollParent.removeEventListener("scroll", onScroll, true);
  }, [projectMenu.isOpen]);

  const onProjectContextMenu = (
    path: string,
    event: MouseEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus();
    projectMenu.open(path, event.clientX, event.clientY);
  };

  const reorderSubset = (
    fullOrder: string[],
    subsetOrder: string[],
    subsetPaths: Set<string>,
  ) => {
    const next: string[] = [];
    let subsetIndex = 0;
    for (const path of fullOrder) {
      if (!subsetPaths.has(path)) {
        next.push(path);
        continue;
      }
      if (subsetIndex < subsetOrder.length) {
        next.push(subsetOrder[subsetIndex++]);
      }
    }
    return next;
  };

  const onReorderPinned = (ids: string[]) => {
    const subset = new Set(pinnedProjects.map((item) => item.path));
    const next = reorderSubset(railOrder, ids, subset);
    setRailOrder(next);
    saveProjectRailOrder(next);
  };

  const onReorderProjects = (ids: string[]) => {
    const subset = new Set(ids);
    const next = reorderSubset(railOrder, ids, subset);
    setRailOrder(next);
    saveProjectRailOrder(next);
  };

  const pinnedIds = pinnedProjects.map((item) => item.path);
  const projectIds = groupedProjectSections.ungrouped.map((item) => item.path);
  const pinnedSortable = useAnimatedReorder(pinnedIds, onReorderPinned, "y");
  const projectSortable = useAnimatedReorder(projectIds, onReorderProjects, "y");
  // A group moves as a block: while one is dragged every group shows only its
  // header (the saved collapsed state is untouched), so the blocks stay one size.
  const groupSortable = useAnimatedReorder(
    projectGroups.map((group) => group.id),
    reorderProjectGroups,
    "y",
    undefined,
    { foldOnDrag: true },
  );
  const shownSections = new Set<RailSectionId>(["projects"]);
  if (lastSessionsShown) shownSections.add("last-sessions");
  if (pinnedProjects.length > 0) shownSections.add("pinned");
  if (projectGroups.length > 0) shownSections.add("groups");
  const rail = useRailSections(shownSections);
  const searchOrPageActive =
    searchActive ||
    inboxActive ||
    notesActive ||
    automationsActive ||
    tasksActive;
  const sectionNodes: Record<RailSectionId, ReactNode> = {
    "last-sessions": recentSessions ? (
      <div className="shrink-0 @max-[140px]/rail:hidden">
      <LastSessionsSection
        source={recentSessions}
        projectKeys={railProjectKeys}
        enabled={visible}
        activeSessionId={activeSessionId}
        searchActive={searchOrPageActive}
        onOpenSession={onSelectAgent}
        onOpenProject={onSelectProject}
        drag={rail.drag("last-sessions")}
        onShownChange={setLastSessionsShown}
        groupLabels={groupLabels}
        groupColors={groupColors}
        groupCustomColors={groupCustomColors}
        groupLogos={groupLogos}
        groupMascots={groupMascots}
      />
      </div>
    ) : null,
    pinned:
      pinnedProjects.length > 0 ? (
        <ProjectSection
          label="Pinned"
          items={pinnedProjects}
          muteStatuses={muteStatuses}
          cwd={cwd}
          busy={busy}
          statsEnabled={visible}
          sortable={pinnedSortable}
          drag={rail.drag("pinned")}
          pinned
          searchActive={searchOrPageActive}
          onSelect={onSelectProject}
          onTogglePin={toggleProjectPin}
          onContextMenu={onProjectContextMenu}
          onOpenMenu={projectMenu.open}
          groupLabels={groupLabels}
          groupColors={groupColors}
          groupCustomColors={groupCustomColors}
          groupLogos={groupLogos}
          groupMascots={groupMascots}
        />
      ) : null,
    groups:
      projectGroups.length > 0 ? (
        <div
          ref={rail.drag("groups").setRef}
          className="reorder-item rail-reorder-block mb-2 shrink-0"
        >
          <ProjectSectionHeader
            label="Groups"
            drag={rail.drag("groups")}
            onAddGroup={(x, y) => projectMenu.createGroup(x, y)}
          />
          <div
            className={`flex-col gap-px px-2 ${rail.folded ? "hidden" : "flex"}`}
          >
            {groupedProjectSections.grouped.map(({ group, items, locked }) => (
              <ProjectGroupSection
                key={group.id}
                group={group}
                items={items}
                locked={locked}
                sortableGroups={groupSortable}
                muteStatuses={muteStatuses}
                cwd={cwd}
                busy={busy}
                statsEnabled={visible}
                searchActive={searchOrPageActive}
                onSelect={onSelectProject}
                onTogglePin={toggleProjectPin}
                onContextMenu={onProjectContextMenu}
                onOpenMenu={projectMenu.open}
                onReorder={onReorderProjects}
                onToggleCollapsed={() =>
                  locked
                    ? projectMenu.requestUnlock(group.id)
                    : updateProjectGroup(group.id, (current) => ({
                        ...current,
                        collapsed: !current.collapsed,
                      }))
                }
                onToggleLock={() => projectMenu.toggleGroupLock(group.id)}
                onOpenGroupMenu={(x, y) =>
                  projectMenu.openGroupMenu(group.id, x, y)
                }
                groupLabels={groupLabels}
                groupColors={groupColors}
                groupCustomColors={groupCustomColors}
                groupLogos={groupLogos}
                groupMascots={groupMascots}
              />
            ))}
          </div>
        </div>
      ) : null,
    projects: (
      <ProjectSection
        label="Projects"
        items={groupedProjectSections.ungrouped}
        muteStatuses={muteStatuses}
        emptyLabel={
          sections.projects.length === 0 && projectGroups.length === 0
            ? "No projects yet"
            : undefined
        }
        onAdd={onOpenProject}
        remoteOnly={remoteOnly}
        onOpenSynced={onOpenSyncedProject}
        cwd={cwd}
        busy={busy}
        statsEnabled={visible}
        sortable={projectSortable}
        drag={rail.drag("projects")}
        pinned={false}
        searchActive={searchOrPageActive}
        onSelect={onSelectProject}
        onTogglePin={toggleProjectPin}
        onContextMenu={onProjectContextMenu}
        onOpenMenu={projectMenu.open}
        groupLabels={groupLabels}
        groupColors={groupColors}
        groupCustomColors={groupCustomColors}
        groupLogos={groupLogos}
        groupMascots={groupMascots}
      />
    ),
  };
  return (
    <nav
      ref={resize.setPaneRef}
      aria-label="Projects"
      className={`sidebar-glass relative shrink-0 flex-col border-r border-stroke ${visible ? "flex" : "hidden"}`}
    >
      <div
        className="@container/rail flex h-10 shrink-0 select-none items-center overflow-hidden pr-1.5"
        data-tauri-drag-region="deep"
      >
        {IS_MAC ? <div className="w-[78px] shrink-0" /> : null}
        <DevModeSlot />
        {/* Icon-only, just the panel toggle fits; in settings nothing does. */}
        <div
          className={`shrink-0 ${
            settingsOpen
              ? "@max-[140px]/rail:hidden"
              : "@max-[140px]/rail:[&_button:not(:last-child)]:hidden"
          }`}
        >
          <TabVisitNav
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={onGoBack}
            onGoForward={onGoForward}
            onTogglePanel={settingsOpen ? undefined : onTogglePanel}
            panelActive
          />
        </div>
      </div>

      <div className="@container/rail flex min-h-0 flex-1 flex-col">
      {settingsOpen ? (
        <SettingsNav
          section={settingsSection}
          onSelect={(next) => onSelectSettingsSection?.(next)}
          onClose={() => onCloseSettings?.()}
        />
      ) : (
        <>
          <div className="flex shrink-0 flex-col gap-px px-2 pb-2 pt-0.5">
            <RailSearch
              label="Search"
              icon={Search}
              onClick={onSearch}
              active={searchActive}
              shortcut={`${MOD}K`}
              ariaLabel={`Search (${MOD}K)`}
            />
            <div className="mt-0.5" />
            <RailAction
              label="Inbox"
              icon={Inbox}
              onClick={onOpenInbox}
              onOpenContextMenu={(x, y) => {
                menuTrigger.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                projectMenu.close();
                setInboxMenu({ x, y });
              }}
              active={inboxActive}
              dot={inboxUnseen}
              ariaLabel={inboxUnseen ? "Inbox, new items" : "Inbox"}
            />
            {notesEnabled ? (
              <RailAction
                label="Notes"
                icon={File}
                onClick={onOpenNotes}
                active={notesActive}
                ariaLabel="Notes"
              />
            ) : null}
            <RailAction
              label="Automations"
              icon={Zap}
              onClick={onOpenAutomations}
              active={automationsActive}
              ariaLabel="Automations"
            />
            <RailAction
              label="Tasks"
              icon={DashboardSquare}
              onClick={onOpenTasks}
              active={tasksActive}
              ariaLabel="Tasks"
            />
          </div>

          <div
            ref={(el) => {
              lockOverscroll(el);
              scrollRef.current = el;
            }}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none pb-2"
          >
            {rail.order.map((id) => (
              <Fragment key={id}>{sectionNodes[id]}</Fragment>
            ))}
          </div>
          <div className="shrink-0 @max-[140px]/rail:hidden">
            <LiveAgentsPreview
              agents={visibleLiveAgents}
              activeSessionId={activeSessionId}
              onSelect={onSelectAgent}
              groupLabels={groupLabels}
              groupColors={groupColors}
              groupCustomColors={groupCustomColors}
              groupMascots={groupMascots}
            />
          </div>
          <CompactLiveAgents
            agents={visibleLiveAgents}
            activeSessionId={activeSessionId}
            onSelect={onSelectAgent}
            groupLabels={groupLabels}
            groupColors={groupColors}
            groupCustomColors={groupCustomColors}
            groupMascots={groupMascots}
          />
          <div className="shrink-0 @max-[140px]/rail:hidden">
            <SidebarUpdateFooter
              update={updateNotice}
              onOpenWhatsNew={onOpenWhatsNew}
              onDismissUpdate={onDismissUpdate}
            />
          </div>
          <div className="flex shrink-0 flex-col gap-px p-2">
            <div className="@max-[140px]/rail:hidden">
              <GithubStarPrompt />
            </div>
            <RailAction
              label="Settings"
              icon={Settings}
              onClick={onOpenSettings}
              shortcut={`${MOD},`}
              ariaLabel={`Settings (${MOD},)`}
            />
          </div>
        </>
      )}
      </div>
      {visible ? projectMenu.element : null}
      {visible ? rail.element : null}
      {visible && inboxMenu ? (
        <InboxNotificationMenu
          {...inboxMenu}
          projectPaths={[...railProjectKeys]}
          onOpenSettings={onOpenNotificationSettings}
          onClose={() => {
            setInboxMenu(null);
            menuTrigger.current?.focus();
          }}
        />
      ) : null}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize project sidebar"
        aria-valuenow={resize.width}
        aria-valuemin={PROJECT_RAIL_WIDTH_MIN}
        aria-valuemax={PROJECT_RAIL_WIDTH_MAX}
        className={`absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none ${
          resize.dragging ? "bg-content/15" : "hover:bg-content/10"
        }`}
        onPointerDown={resize.onPointerDown}
        onDoubleClick={resize.onDoubleClick}
      />
    </nav>
  );
}

type SortableHandle = ReturnType<typeof useAnimatedReorder>;

function ProjectSection({
  label,
  items,
  muteStatuses,
  emptyLabel,
  onAdd,
  remoteOnly,
  onOpenSynced,
  cwd,
  busy,
  statsEnabled,
  sortable,
  drag,
  pinned,
  searchActive,
  onSelect,
  onTogglePin,
  onContextMenu,
  onOpenMenu,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupLogos,
  groupMascots,
}: {
  label: string;
  items: RecentProject[];
  muteStatuses: ReadonlyMap<string, string | null>;
  emptyLabel?: string;
  onAdd?: () => void;
  remoteOnly?: readonly RemoteOnlyProject[];
  onOpenSynced?: (projectId: string, name: string) => void | Promise<void>;
  cwd: string;
  busy: Set<string>;
  statsEnabled: boolean;
  sortable: SortableHandle;
  /** Moves the whole section; its body hides while any section is dragged. */
  drag: RailSectionDrag;
  pinned: boolean;
  searchActive: boolean;
  onSelect: (path: string) => void;
  onTogglePin: (path: string) => void;
  onContextMenu: (path: string, event: MouseEvent<HTMLElement>) => void;
  onOpenMenu: (path: string, x: number, y: number) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupLogos: ReturnType<typeof useTabGroupLogos>;
  groupMascots: Record<string, string>;
}) {
  return (
    <div
      ref={drag.setRef}
      className="reorder-item rail-reorder-block shrink-0 mb-2"
    >
      <ProjectSectionHeader label={label} onAdd={onAdd} drag={drag} />
      {items.length === 0 && emptyLabel && !drag.folded ? (
        <p className="px-4 pb-1 text-[11px] leading-tight text-content/40 @max-[140px]/rail:hidden">
          {emptyLabel}
        </p>
      ) : null}
      <div className={`flex-col gap-px px-2 ${drag.folded ? "hidden" : "flex"}`}>
        {items.map((item) => (
          <ProjectCard
            key={item.path}
            item={item}
            muteStatus={muteStatuses.get(pathKey(item.path)) ?? undefined}
            selected={!searchActive && sameProjectPath(item.path, cwd)}
            busy={isBusyPath(item.path, busy)}
            statsEnabled={statsEnabled}
            pinned={pinned}
            sortable={sortable}
            onSelect={onSelect}
            onTogglePin={onTogglePin}
            onContextMenu={onContextMenu}
            onOpenMenu={onOpenMenu}
            groupLabels={groupLabels}
            groupColors={groupColors}
            groupCustomColors={groupCustomColors}
            groupLogos={groupLogos}
            groupMascots={groupMascots}
          />
        ))}
        {onOpenSynced
          ? remoteOnly?.map((project) => {
              const match = remoteOpenMatch(project);
              return (
                <button
                  key={project.projectId}
                  type="button"
                  title={remoteOnlyProjectHint(project, match)}
                  aria-label={
                    match
                      ? `${project.name}, on ${match.target.name}. Open there`
                      : `${project.name}, on a machine that is not connected`
                  }
                  onClick={() => void onOpenSynced(project.projectId, project.name)}
                  className="flex h-8 min-w-0 cursor-default items-center gap-2 rounded-md px-2 text-left opacity-40 hover:bg-content/8 hover:opacity-70 @max-[140px]/rail:justify-center @max-[140px]/rail:px-0"
                >
                  <LinkIcon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className={nameClassName}>{project.name}</span>
                </button>
              );
            })
          : null}
      </div>
    </div>
  );
}

function ProjectSectionHeader({
  label,
  drag,
  onAdd,
  onAddGroup,
}: {
  label: string;
  drag: RailSectionDrag;
  onAdd?: () => void;
  onAddGroup?: (x: number, y: number) => void;
}) {
  return (
    <div
      {...drag.headerProps}
      tabIndex={0}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      title="Drag to reorder"
      className={`${RAIL_SECTION_HEADER} ${RAIL_DRAG_HANDLE} rounded-md outline-none focus-visible:bg-content/8 @max-[140px]/rail:justify-center @max-[140px]/rail:px-0`}
    >
      <span className="min-w-0 flex-1 truncate px-1 text-xs text-content/50 @max-[140px]/rail:hidden">
        {label}
      </span>
      {onAddGroup ? (
        <button
          type="button"
          data-no-drag
          title="New project group"
          aria-label="New project group"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onAddGroup(rect.left, rect.bottom);
          }}
          className="grid size-5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/8 hover:text-content"
        >
          <FolderPlus className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
      {onAdd ? <AddProjectButton onOpenFolder={onAdd} /> : null}
      <span className="contents @max-[140px]/rail:hidden">
        <SectionMenuButton label={label} onOpen={drag.openMenu} />
      </span>
    </div>
  );
}

function ProjectGroupSection({
  group,
  items,
  muteStatuses,
  cwd,
  busy,
  statsEnabled,
  searchActive,
  onSelect,
  onTogglePin,
  onContextMenu,
  onOpenMenu,
  onReorder,
  onToggleCollapsed,
  onToggleLock,
  onOpenGroupMenu,
  locked,
  sortableGroups,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupLogos,
  groupMascots,
}: {
  group: ProjectGroup;
  /** Locked groups get no items: only the name and the padlock show. */
  locked: boolean;
  /** Orders the groups; the header is the drag handle. */
  sortableGroups: SortableHandle;
  items: RecentProject[];
  muteStatuses: ReadonlyMap<string, string | null>;
  cwd: string;
  busy: Set<string>;
  statsEnabled: boolean;
  searchActive: boolean;
  onSelect: (path: string) => void;
  onTogglePin: (path: string) => void;
  onContextMenu: (path: string, event: MouseEvent<HTMLElement>) => void;
  onOpenMenu: (path: string, x: number, y: number) => void;
  onReorder: (ids: string[]) => void;
  onToggleCollapsed: () => void;
  onToggleLock: () => void;
  onOpenGroupMenu: (x: number, y: number) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupLogos: ReturnType<typeof useTabGroupLogos>;
  groupMascots: Record<string, string>;
}) {
  const sortable = useAnimatedReorder(
    items.map((item) => item.path),
    onReorder,
    "y",
  );
  const countLabel = `${items.length} ${items.length === 1 ? "project" : "projects"}`;
  const expanded = !group.collapsed && !locked;
  const collapsed = !expanded;
  // While any group is dragged, every group shows only its header.
  const folded = sortableGroups.draggingId !== null;
  const showBody = expanded && !folded;
  const linkStatus = useLinkedGroupStatus(group.id);
  const localPaths = useMemo(
    () => items.map((item) => item.path).filter(isLocalProject),
    [items],
  );
  // Only an expanded group shows project cards, which already load these
  // stats. Reading them here adds no git calls; a collapsed group shows no
  // count rather than starting new ones.
  const groupStats = useProjectsDiffStats(localPaths, statsEnabled && expanded);
  const gitSummary = summarizeGroupGit(
    localPaths.map((_, index) => ({
      remote: false,
      files: groupStats[index]?.files ?? null,
    })),
  );
  const gitAnchor = useRef<HTMLButtonElement>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const gitTitle =
    gitSummary.known > 0
      ? `${gitSummary.dirty} of ${gitSummary.local} ${gitSummary.local === 1 ? "project has" : "projects have"} uncommitted changes`
      : "Git overview";
  const openMenu = (target: HTMLElement, x?: number, y?: number) => {
    const rect = target.getBoundingClientRect();
    onOpenGroupMenu(x ?? rect.left, y ?? rect.bottom);
  };

  return (
    <div
      ref={(el) => sortableGroups.setItemRef(group.id, el)}
      className={`reorder-item rail-reorder-block shrink-0 overflow-hidden rounded-md ${
        showBody ? "mb-1.5 bg-content/5" : ""
      }`}
      data-project-group={group.id}
      role="group"
      aria-label={group.name}
    >
      <div
        className={`project-reorder-item group relative flex h-8 items-stretch rounded-md px-2 opacity-65 @max-[140px]/rail:px-0 ${RAIL_DRAG_HANDLE}`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement | null)?.closest("[data-no-drag]")) {
            return;
          }
          sortableGroups.onItemPointerDown(group.id, event);
        }}
        // The click that ends a drag must not expand, collapse or unlock.
        onClickCapture={(event) => {
          if (!sortableGroups.consumeClick()) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          const step = moveStepForKey(event);
          if (!step) return;
          event.preventDefault();
          event.stopPropagation();
          moveProjectGroup(group.id, step);
          keepFocus(event.target as HTMLElement);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus();
          openMenu(event.currentTarget, event.clientX, event.clientY);
        }}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={locked ? `${group.name}, locked` : `${group.name}, ${countLabel}`}
          title={locked ? `${group.name} · Locked` : `${group.name} · ${countLabel}`}
          onClick={onToggleCollapsed}
          className="flex min-w-0 flex-1 cursor-grab items-center gap-2 text-left @max-[140px]/rail:justify-center"
        >
          <div className="grid size-4 shrink-0 place-items-center">
            {collapsed ? (
              <>
                <span
                  data-group-mascot
                  className="grid size-4 place-items-center group-hover:hidden group-has-[:focus-visible]:hidden"
                >
                  <ProjectMascot
                    project={group.id}
                    color={projectGroupColor(group)}
                    name={group.mascot ?? null}
                    className="size-3"
                  />
                </span>
                <ChevronRight
                  data-group-chevron
                  className="hidden size-3.5 group-hover:block group-has-[:focus-visible]:block"
                  strokeWidth={1.75}
                />
              </>
            ) : (
              <ChevronDown
                data-group-chevron
                className="size-3.5"
                strokeWidth={1.75}
              />
            )}
          </div>
          <span className={nameClassName}>{group.name}</span>
          {group.workspaceFile && !locked ? (
            <span
              role="img"
              aria-label={
                linkStatus
                  ? `Linked workspace file problem: ${linkStatus.message}`
                  : `Linked to ${group.workspaceFile}`
              }
              title={
                linkStatus
                  ? `${linkStatus.message}
The group was left as it is.`
                  : `Linked to ${group.workspaceFile}`
              }
              className={`grid size-4 shrink-0 place-items-center ${
                linkStatus ? "text-amber-400" : "text-content/45"
              } @max-[140px]/rail:hidden`}
            >
              {linkStatus ? (
                <AlertCircle className="size-3" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <File className="size-3" strokeWidth={1.75} aria-hidden="true" />
              )}
            </span>
          ) : null}
        </button>
        <div className="my-auto flex shrink-0 items-center transition-[margin] duration-150 group-hover:mr-6 group-has-[:focus-visible]:mr-6 motion-reduce:transition-none @max-[140px]/rail:hidden">
        {localPaths.length > 0 ? (
          <button
            ref={gitAnchor}
            type="button"
            data-no-drag
            title={gitTitle}
            aria-label={`${group.name} git overview, ${gitTitle}`}
            aria-haspopup="dialog"
            aria-expanded={overviewOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setOverviewOpen((value) => !value);
            }}
            className="my-auto flex h-5 shrink-0 items-center gap-0.5 rounded-md px-1 text-[11px] font-semibold tabular-nums text-content/50 hover:bg-content/8 hover:text-content aria-expanded:bg-content/8"
          >
            <GitBranch className="size-3" strokeWidth={1.75} />
            {gitSummary.dirty > 0 ? (
              <span className="text-amber-400">{gitSummary.dirty}</span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          data-no-drag
          title={locked ? "Unlock…" : "Lock group"}
          aria-label={locked ? `Unlock ${group.name}` : `Lock ${group.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleLock();
          }}
          className={`size-5 shrink-0 place-items-center rounded-md hover:bg-content/8 hover:text-content ${
            locked
              ? "grid text-content/60"
              : "hidden text-content/50 group-hover:grid group-has-[:focus-visible]:grid"
          }`}
        >
          {locked ? (
            <Lock className="size-3.5" strokeWidth={1.75} />
          ) : (
            <LockOpen className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
        </div>
        {overviewOpen ? (
          <GroupGitPopover
            anchor={gitAnchor}
            name={group.name}
            paths={items.map((item) => item.path)}
            onSelect={(path) => {
              setOverviewOpen(false);
              window.dispatchEvent(
                new CustomEvent(OPEN_PROJECT_CHANGES_EVENT, { detail: path }),
              );
            }}
            onDismiss={() => setOverviewOpen(false)}
          />
        ) : null}
        <button
          type="button"
          data-no-drag
          title="Group options"
          aria-label={`${group.name} group options`}
          aria-haspopup="menu"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            openMenu(event.currentTarget);
          }}
          className="absolute right-1 top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-md text-content/55 hover:bg-content/8 hover:text-content group-hover:grid group-has-[:focus-visible]:grid @max-[140px]/rail:hidden!"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      {expanded ? (
        <div
          data-project-group-items
          className={`flex-col gap-px p-1 ${folded ? "hidden" : "flex"}`}
        >
          {items.map((item) => (
            <ProjectCard
              key={item.path}
              item={item}
              muteStatus={muteStatuses.get(pathKey(item.path)) ?? undefined}
              selected={!searchActive && sameProjectPath(item.path, cwd)}
              busy={isBusyPath(item.path, busy)}
              statsEnabled={statsEnabled}
              pinned={false}
              sortable={sortable}
              onSelect={onSelect}
              onTogglePin={onTogglePin}
              onContextMenu={onContextMenu}
              onOpenMenu={onOpenMenu}
              groupLabels={groupLabels}
              groupColors={groupColors}
              groupCustomColors={groupCustomColors}
              groupLogos={groupLogos}
              groupMascots={groupMascots}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const nameClassName =
  "min-w-0 flex-1 truncate text-sm font-medium leading-tight @max-[140px]/rail:hidden";

function ProjectCard({
  item,
  muteStatus,
  selected,
  busy,
  statsEnabled,
  pinned,
  sortable,
  onSelect,
  onTogglePin,
  onContextMenu,
  onOpenMenu,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupLogos,
  groupMascots,
}: {
  item: RecentProject;
  muteStatus?: string;
  selected: boolean;
  busy: boolean;
  statsEnabled: boolean;
  pinned: boolean;
  sortable: SortableHandle;
  onSelect: (path: string) => void;
  onTogglePin: (path: string) => void;
  onContextMenu: (path: string, event: MouseEvent<HTMLElement>) => void;
  onOpenMenu: (path: string, x: number, y: number) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupLogos: ReturnType<typeof useTabGroupLogos>;
  groupMascots: Record<string, string>;
}) {
  const fallbackName = basename(item.path);
  const key = projectKey(item.path);
  const seed = projectName(item.path);
  const name = resolveTabGroupLabel(key, groupLabels, fallbackName);
  const logoPath = resolveTabGroupLogo(key, groupLogos);
  const color = resolveTabGroupColor(key, groupColors, groupCustomColors, seed);
  const diffEnabled = statsEnabled && Boolean(item.path) && item.path !== "~";
  const stats = useProjectDiffStats(item.path, diffEnabled);
  const files = stats?.files ?? 0;
  const additions = stats?.additions ?? 0;
  const deletions = stats?.deletions ?? 0;
  const hasChanges = files > 0 || additions > 0 || deletions > 0;
  const remote = remoteProjectFor(item.path);
  const { machines } = useRemoteMachines(!!remote);
  const machine = remote
    ? machines.find((entry) => entry.environmentId === remote.environmentId)
    : undefined;
  // Keeps the machine checked while its row is on screen; the shared
  // connection status below is what the row shows.
  useRemoteMachineOnline(machine?.id);
  const remoteConnection = useRemoteConnection(item.path);
  const indicator = connectionIndicator(remoteConnection, remoteConnection.reconnecting);
  const reconnectable = !!machine && indicator.tone === "down";
  const connection = !remote
    ? ""
    : !machine
      ? "Machine not connected on this computer"
      : indicator.label;
  const cardTitle = projectCardTitle(
    remote
      ? `${remote.cwd} on ${machine?.name ?? "another machine"} (${connection})`
      : item.path,
    name,
    stats,
    busy,
  );
  const cardAriaLabel = projectCardAriaLabel(
    machine ? `${name} on ${machine.name}` : name,
    stats,
    busy,
  );
  const labelClassName = machine
    ? "min-w-0 max-w-[75%] shrink-0 truncate text-sm font-medium leading-tight @max-[140px]/rail:hidden"
    : nameClassName;

  return (
    <div
      ref={(el) => sortable.setItemRef(item.path, el)}
      data-selected={selected || undefined}
      data-project-path={item.path}
      className={`reorder-item project-reorder-item group relative flex touch-none items-stretch rounded-md px-2 h-8 @max-[140px]/rail:px-0 ${
        selected
          ? "bg-selection-strong text-content"
          : "opacity-65"
      } cursor-default`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement | null)?.closest("[data-no-drag]")) {
          return;
        }
        sortable.onItemPointerDown(item.path, event);
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement | null)?.closest("[data-no-drag]")) {
          return;
        }
        if (sortable.consumeClick()) return;
        onSelect(item.path);
      }}
      onContextMenu={(event) => onContextMenu(item.path, event)}
      onKeyDown={(event) => {
        if (
          event.key !== "ContextMenu" &&
          !(event.shiftKey && event.key === "F10")
        ) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onOpenMenu(item.path, rect.left, rect.bottom);
      }}
    >
      <button
        type="button"
        title={muteStatus ? `${cardTitle}\n${muteStatus}` : cardTitle}
        aria-label={muteStatus ? `${cardAriaLabel}, ${muteStatus}` : cardAriaLabel}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 cursor-default items-center gap-2 text-left transition-[padding] duration-150 motion-reduce:transition-none group-hover:pr-6 group-has-[:focus-visible]:pr-6 @max-[140px]/rail:justify-center @max-[140px]/rail:pr-0!"
      >
        <div className="project-card-logo grid size-4 shrink-0 place-items-center transition-opacity group-hover:opacity-0 @max-[140px]/rail:opacity-100!">
          {logoPath && !busy ? (
            <ProjectLogoIcon
              path={logoPath}
              className="size-4 rounded-sm"
              imageClassName="size-4"
            />
          ) : (
            <ProjectMascot
              project={seed}
              color={color}
              name={resolveTabGroupMascot(key, groupMascots)}
              className="size-3"
              active={busy}
            />
          )}
        </div>
        {busy ? (
          <Shimmer as="span" duration={1.4} className={labelClassName}>
            {name}
          </Shimmer>
        ) : (
          <span className={labelClassName}>{name}</span>
        )}
        {machine ? (
          <span className="min-w-0 flex-1 truncate text-[11px] leading-tight text-content/45 @max-[140px]/rail:hidden">
            {machine.name}
          </span>
        ) : null}
        {hasChanges ? (
          <span className="project-card-stats shrink-0 group-hover:hidden group-has-[:focus-visible]:hidden @max-[140px]/rail:hidden!">
            <ProjectDiffStat additions={additions} deletions={deletions} />
          </span>
        ) : null}
        {remote ? (
          <span
            role={reconnectable ? "button" : "img"}
            aria-label={reconnectable ? `${connection} Reconnect machine` : connection}
            title={reconnectable ? `${connection}
Click to reconnect` : undefined}
            data-no-drag={reconnectable ? "" : undefined}
            onPointerDown={reconnectable ? (event) => event.stopPropagation() : undefined}
            onClick={
              reconnectable
                ? (event) => {
                    event.stopPropagation();
                    void remoteConnection.reconnect({ signIn: true });
                  }
                : undefined
            }
            className={`relative grid size-4 shrink-0 place-items-center text-content/45 @max-[140px]/rail:hidden ${
              reconnectable ? "cursor-pointer hover:text-content" : ""
            }`}
          >
            <Internet className="size-3" strokeWidth={1.75} aria-hidden="true" />
            <span
              aria-hidden="true"
              className={`absolute right-0 bottom-0 size-1.5 rounded-full ring-1 ring-background-base ${
                indicator.tone === "connected"
                  ? "bg-emerald-400"
                  : indicator.tone === "connecting"
                    ? "bg-amber-400"
                    : "bg-red-400"
              }`}
            />
          </span>
        ) : null}
        {muteStatus ? (
          <span
            role="img"
            aria-label={muteStatus}
            title={muteStatus}
            className="grid size-4 shrink-0 place-items-center text-amber-400 @max-[140px]/rail:hidden"
          >
            <BellOff className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </span>
        ) : null}
      </button>
      {hasChanges ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-1.5 top-1.5 hidden size-1.5 rounded-full bg-emerald-400 @max-[140px]/rail:block"
        />
      ) : null}
      <button
        type="button"
        data-no-drag
        title="Project options"
        aria-label="Project options"
        aria-haspopup="menu"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          onOpenMenu(
            item.path,
            event.detail === 0 ? rect.left : event.clientX,
            event.detail === 0 ? rect.bottom : event.clientY,
          );
        }}
        className="absolute right-1 top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-md text-content/55 hover:bg-content/8 hover:text-content group-hover:grid group-has-[:focus-visible]:grid @max-[140px]/rail:hidden!"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        data-no-drag
        title={pinned ? "Unpin project" : "Pin project"}
        aria-label={pinned ? "Unpin project" : "Pin project"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin(item.path);
        }}
        className="absolute left-2 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-sm text-content/55 opacity-0 pointer-events-none transition-opacity hover:text-content group-hover:pointer-events-auto group-hover:opacity-100 @max-[140px]/rail:hidden!"
      >
        {pinned ? (
          <PinOff className="size-3.5" strokeWidth={1.75} />
        ) : (
          <Pin className="size-3.5" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}

/** The live-agent list as one mascot per agent, for the icon-only rail. */
function CompactLiveAgents({
  agents,
  activeSessionId,
  onSelect,
  groupLabels,
  groupColors,
  groupCustomColors,
  groupMascots,
}: {
  agents: LiveAgent[];
  activeSessionId?: string;
  onSelect?: (sessionId: string) => void;
  groupLabels: Record<string, string>;
  groupColors: Record<string, number>;
  groupCustomColors: Record<string, string>;
  groupMascots: Record<string, string>;
}) {
  if (!shouldShowLiveAgents(agents, activeSessionId)) return null;
  const working = agents.filter((agent) => !agent.done).length;
  const heading = working > 0 ? "Working" : "Finished";
  return (
    <section
      aria-label={`${heading} agents`}
      className="hidden shrink-0 flex-col items-center gap-px px-2 pb-1 @max-[140px]/rail:flex"
    >
      <div
        role="img"
        aria-label={`${heading}, ${agents.length}`}
        title={`${heading} · ${agents.length}`}
        className={`my-1 size-1.5 shrink-0 rounded-full ${
          working > 0
            ? "bg-accent shadow-[0_0_8px_var(--color-accent)] motion-safe:animate-pulse"
            : "bg-content/35"
        }`}
      />
      <div className="flex max-h-[30vh] w-full flex-col gap-px overflow-y-auto overscroll-none">
        {agents.map((agent) => {
          const seed = projectName(agent.cwd);
          const key = projectKey(agent.cwd);
          const project = resolveTabGroupLabel(key, groupLabels, seed);
          const color = resolveTabGroupColor(
            key,
            groupColors,
            groupCustomColors,
            seed,
          );
          const activity = agent.needsApproval
            ? "Need approval"
            : agent.done
              ? "Done"
              : agent.activity;
          const parts = [agent.title, project, activity].filter(Boolean);
          return (
            <button
              key={agent.id}
              type="button"
              title={parts.join("\n")}
              aria-label={parts.join(", ")}
              aria-current={agent.id === activeSessionId ? "true" : undefined}
              onClick={() => onSelect?.(agent.id)}
              className={`relative grid h-8 w-full shrink-0 place-items-center rounded-md ${
                agent.id === activeSessionId
                  ? "bg-selection"
                  : "hover:bg-content/8"
              }`}
            >
              <ProjectMascot
                project={seed}
                color={color}
                name={resolveTabGroupMascot(key, groupMascots)}
                className="size-3"
                active={!agent.needsApproval && !agent.done}
              />
              {agent.needsApproval ? (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-amber-400"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function isBusyPath(path: string, busy: Set<string>): boolean {
  for (const other of busy) {
    if (sameProjectPath(path, other)) return true;
  }
  return false;
}

function ProjectDiffStat({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) return null;

  const label = [
    additions > 0 ? `+${formatInteger(additions)}` : "",
    deletions > 0 ? `-${formatInteger(deletions)}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      title={`${label} uncommitted`}
      className="flex shrink-0 items-center gap-1 font-sans text-[11px] font-semibold tabular-nums"
    >
      {additions > 0 ? (
        <span className="text-emerald-400">+{formatInteger(additions)}</span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-red-400">-{formatInteger(deletions)}</span>
      ) : null}
    </span>
  );
}

function projectCardTitle(
  path: string,
  name: string,
  stats: GitDiffStats | null,
  busy: boolean,
): string {
  const parts = [name, path];
  if (busy) parts.push("Working");
  const files = stats?.files ?? 0;
  const additions = stats?.additions ?? 0;
  const deletions = stats?.deletions ?? 0;
  if (files > 0 || additions > 0 || deletions > 0) {
    parts.push(
      [
        files > 0 ? `${files} ${files === 1 ? "file" : "files"} changed` : "",
        additions > 0 ? `+${formatInteger(additions)}` : "",
        deletions > 0 ? `-${formatInteger(deletions)}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return parts.join("\n");
}

function projectCardAriaLabel(
  name: string,
  stats: GitDiffStats | null,
  busy: boolean,
): string {
  const parts = [name];
  if (busy) parts.push("working");
  const files = stats?.files ?? 0;
  const additions = stats?.additions ?? 0;
  const deletions = stats?.deletions ?? 0;
  if (files > 0) {
    parts.push(`${files} ${files === 1 ? "file" : "files"} changed`);
  }
  if (additions > 0) parts.push(`+${formatInteger(additions)}`);
  if (deletions > 0) parts.push(`-${formatInteger(deletions)}`);
  return parts.join(", ");
}

/** Adds a folder on this computer, or one on a connected machine. */
function AddProjectButton({ onOpenFolder }: { onOpenFolder: () => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-content/80 hover:bg-content/8 hover:text-content";
  return (
    <>
      <button
        ref={anchor}
        type="button"
        data-no-drag
        title="Open project"
        aria-label="Open project"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-5 shrink-0 place-items-center rounded-md text-content/50 hover:bg-content/8 hover:text-content aria-expanded:bg-content/8 aria-expanded:text-content"
      >
        <Plus className="size-3.5" strokeWidth={1.75} />
      </button>
      {open ? (
        <Popover
          anchor={anchor}
          align="start"
          width={290}
          onDismiss={() => setOpen(false)}
          role="menu"
          aria-label="Open project"
          className="p-1"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onOpenFolder();
            }}
          >
            <FolderPlus className="size-3.5 shrink-0" strokeWidth={1.75} />
            Open folder…
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(OPEN_CODE_WORKSPACE_EVENT));
            }}
          >
            <FolderPlus className="size-3.5 shrink-0" strokeWidth={1.75} />
            Open VS Code workspace…
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(OPEN_REMOTE_PROJECT_EVENT));
            }}
          >
            <Internet className="size-3.5 shrink-0" strokeWidth={1.75} />
            Open folder on a machine…
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(OPEN_SESSION_IMPORT_EVENT));
            }}
          >
            <Archive className="size-3.5 shrink-0" strokeWidth={1.75} />
            Import Claude Code / Codex sessions…
          </button>
        </Popover>
      ) : null}
    </>
  );
}
