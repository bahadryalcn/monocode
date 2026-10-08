import { t, sourceMessages } from "../../../shared/i18n";
import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import {
  ALT,
  IS_MAC,
  IS_WIN,
  MOD,
  SHIFT,
} from "../../../platform/tauri/platform";
import {
  canonicalShortcut,
  isGlobalShortcut,
  QUICK_COMPOSER_DEFAULT_SHORTCUT,
  quickComposerShortcutLabel,
  shortcutFromKeyEvent,
  shortcutTokens,
} from "../../quick-composer/model/quickComposerShortcut";
import { readFlag, writeFlag } from "./storageFlags";

const SECTION_KEY = "monocode.settingsSection";

export type SettingsSectionId =
  | "general"
  | "connections"
  | "appearance"
  | "keybindings"
  | "terminal"
  | "chat"
  | "providers"
  | "usage"
  | "mcp"
  | "skills"
  | "inbox"
  | "worktrees"
  | "groupLock"
  | "archive";

/** Rail buckets. Sections list in order under their group label. */
export type SettingsGroupId = "app" | "agents" | "workspace";

export const SETTINGS_GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: "app", get label() { return t("App"); } },
  { id: "agents", get label() { return t("Agents"); } },
  { id: "workspace", get label() { return t("Workspace"); } },
];

export type SettingsSection = {
  id: SettingsSectionId;
  group: SettingsGroupId;
  label: string;
  description: string;
  /** Extra words search matches the section on, beyond its label. */
  keywords?: string;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    group: "app",
    get label() { return t("General"); },
    get description() { return t("The build you are running, how {p0} reaches you, and the panels it shows.", { p0: PRODUCT_IDENTITY.displayName }); },
    keywords: "version update sounds notifications notes rail sleep",
  },
  {
    id: "connections",
    group: "app",
    get label() { return t("Connections"); },
    get description() { return t("Connect your machines and run agents remotely through SSH."); },
    keywords: "ssh remote host machine server environment always on",
  },
  {
    id: "appearance",
    group: "app",
    get label() { return t("Appearance"); },
    get description() { return t("Theme, tint, translucency, workspace layout, and conversation backgrounds."); },
    keywords:
      "theme dark light color accent glass blur zoom scale wallpaper rail sidebar",
  },
  {
    id: "keybindings",
    group: "app",
    get label() { return t("Keybindings"); },
    get description() { return t("Every shortcut the workspace handles, from the app menu and the key handler."); },
    keywords: "shortcut hotkey keyboard binding",
  },
  {
    id: "terminal",
    group: "app",
    get label() { return t("Terminal"); },
    get description() { return t("The shell new terminals open in and `!commands` from the composer run in."); },
    keywords:
      "shell profile bash git bash powershell pwsh cmd command prompt wsl zsh fish default",
  },
  {
    id: "chat",
    group: "agents",
    get label() { return t("Chat"); },
    get description() { return t("How transcripts read, what the composer does with a follow-up, how files save, and how diffs open."); },
    keywords:
      "transcript composer prompt message diff review layout format save editor template snippet trigger queue",
  },
  {
    id: "providers",
    group: "agents",
    get label() { return t("Providers"); },
    get description() { return t("Provider accounts, agent CLIs {p0} can drive, and the model new sessions start with.", { p0: PRODUCT_IDENTITY.displayName }); },
    keywords:
      "account sign in login model harness claude codex gemini cli default hooks",
  },
  {
    id: "usage",
    group: "agents",
    get label() { return t("Usage"); },
    get description() { return t("Account limits, remaining capacity and usage by project."); },
    keywords: "quota limits weekly session tokens cost",
  },
  {
    id: "mcp",
    group: "agents",
    get label() { return t("MCP"); },
    get description() { return t("Find MCP servers across providers and manage their connections."); },
    keywords:
      "tools servers connections oauth authenticate login claude codex cursor opencode",
  },
  {
    id: "skills",
    group: "agents",
    get label() { return t("Skills"); },
    get description() { return t("Discover and manage file skills from project, personal, and harness folders."); },
    keywords: "skill instructions prompt",
  },
  {
    id: "inbox",
    group: "workspace",
    get label() { return t("Inbox"); },
    get description() { return t("Manage Inbox services and notification preferences for each project."); },
    keywords:
      "github gitlab linear jira atlassian azure devops connect token integration",
  },
  {
    id: "archive",
    group: "workspace",
    get label() { return t("Archive"); },
    get description() { return t("Projects and conversations you have archived."); },
    keywords: "archived restore delete hidden",
  },
  {
    id: "worktrees",
    group: "workspace",
    get label() { return t("Worktrees"); },
    get description() { return t("Manage additional worktrees for each project."); },
    keywords: "git branch worktree working copy project create delete",
  },
  {
    id: "groupLock",
    group: "workspace",
    get label() { return t("Group privacy"); },
    get description() { return t("Hide and restore project groups, or protect them with a password. Hidden projects stay on disk."); },
    keywords:
      "password privacy hide hidden restore private protect secure passcode gizli gizle geri getir görünür",
  },
];

export function settingsSectionsByGroup(): {
  id: SettingsGroupId;
  label: string;
  sections: SettingsSection[];
}[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: SETTINGS_SECTIONS.filter((section) => section.group === group.id),
  })).filter((group) => group.sections.length > 0);
}

/**
 * One searchable control. `id` is the row's `data-setting-id` in SettingsView,
 * which is also what Settings scrolls to when it opens on an anchor.
 */
export type SettingsEntry = {
  id: string;
  section: SettingsSectionId;
  label: string;
  keywords?: string;
};

export const SETTINGS_INDEX: SettingsEntry[] = [
  {
    id: "interface-language",
    section: "general",
    get label() { return t("Application language"); },
    keywords: "language locale translation system türkçe dil çeviri english deutsch français español português 中文 日本語",
  },
  {
    id: "terminal-default-profile",
    section: "terminal",
    get label() { return t("Default terminal profile"); },
    keywords:
      "shell bash git bash powershell pwsh cmd wsl zsh default ! command",
  },
  {
    id: "hidden-project-groups",
    section: "groupLock",
    get label() { return t("Hidden groups"); },
    keywords:
      "hide hidden restore recover show visible temporary privacy personal gizli gizle geri getir görünür kişisel",
  },
  {
    id: "group-lock-password",
    section: "groupLock",
    get label() { return t("Lock password"); },
    keywords: "set change remove forgot reset passcode group rail protect",
  },
  {
    id: "group-lock-options",
    section: "groupLock",
    get label() { return t("Lock groups again when {p0} starts", { p0: PRODUCT_IDENTITY.displayName }); },
    keywords: "auto lock inactivity timeout minutes launch startup unlock all",
  },
  {
    id: "group-lock-groups",
    section: "groupLock",
    get label() { return t("Lockable groups"); },
    keywords: "group rail project password lock now",
  },
  {
    id: "remote-machines",
    section: "connections",
    get label() { return t("Your machines"); },
    keywords: "ssh remote connect host server environment",
  },
  {
    id: "remote-auto-reconnect",
    section: "connections",
    get label() { return t("Automatically reconnect to remote machines"); },
    keywords: "ssh remote retry reconnect drop tunnel offline background",
  },
  {
    id: "mcp-servers",
    section: "mcp",
    get label() { return t("MCP servers"); },
    keywords: "claude tools connections oauth authenticate login add remove",
  },
  {
    id: "project-worktrees",
    section: "worktrees",
    get label() { return t("Project worktrees"); },
    keywords: "git branch working copy create delete manage",
  },
  {
    id: "update",
    section: "general",
    get label() { return t("Version"); },
    keywords: "update upgrade release what's new build changelog",
  },
  {
    id: "import-history",
    section: "general",
    get label() { return t("Import Claude Code and Codex sessions"); },
    keywords: "history conversations terminal resume migrate existing",
  },
  {
    id: "sounds",
    section: "general",
    get label() { return t("Sounds"); },
    keywords: "audio cue chime mute volume",
  },
  {
    id: "notifications",
    section: "general",
    get label() { return t("Notifications"); },
    keywords: "notify alert toast permission reminder background",
  },
  {
    id: "notes",
    section: "general",
    get label() { return t("Notes"); },
    keywords: "notebook markdown rail scratchpad",
  },
  ...(IS_MAC
    ? [
        {
          id: "quick-composer",
          section: "general" as const,
          get label() { return t("Quick composer"); },
          keywords: "spotlight global shortcut hotkey floating prompt anywhere",
        },
      ]
    : []),
  {
    id: "working-agents",
    section: "general",
    get label() { return t("Working agents"); },
    keywords: "live running sessions rail card",
  },
  {
    id: "file-tabs",
    section: "general",
    get label() { return t("File tabs"); },
    keywords: "editor open top workspace normal session pane beside chat",
  },
  {
    id: "tab-animations",
    section: "general",
    get label() { return t("Tab animations"); },
    keywords: "motion open close resize transition",
  },
  {
    id: "keep-awake",
    section: "general",
    get label() { return t("Prevent sleep while agents work"); },
    keywords:
      "sleep awake idle running agents windows linux macos duration 15 30 hour forever hold after",
  },
  {
    id: "keep-awake-screen",
    section: "general",
    get label() { return t("Keep the screen on"); },
    keywords: "sleep display screen blank dim lock awake",
  },
  ...(IS_WIN
    ? [
        {
          id: "close-to-tray",
          section: "general" as const,
          get label() { return t("Close to tray"); },
          keywords: "minimize background quit exit window taskbar windows",
        },
      ]
    : []),
  {
    id: "theme",
    section: "appearance",
    get label() { return t("Theme"); },
    keywords: "dark light system appearance mode",
  },
  {
    id: "interface-contrast",
    section: "appearance",
    get label() { return t("Contrast"); },
    keywords: "borders secondary text softer stronger",
  },
  {
    id: "chat-width",
    section: "appearance",
    get label() { return t("Chat width"); },
    keywords: "comfortable wide full messages composer",
  },
  {
    id: "interface-font",
    section: "appearance",
    get label() { return t("Interface font"); },
    keywords: "typography typeface Segoe Arial Verdana",
  },
  {
    id: "monospace-font",
    section: "appearance",
    get label() { return t("Monospace font"); },
    keywords: "code terminal font size Consolas Menlo typography",
  },
  {
    id: "code-word-wrap",
    section: "appearance",
    get label() { return t("Word wrap"); },
    keywords: "code long lines wrapping",
  },
  {
    id: "decorative-motion",
    section: "appearance",
    get label() { return t("Decorative animations"); },
    keywords: "motion reduced accessibility mascot particles welcome effects",
  },
  {
    id: "accent-color",
    section: "appearance",
    get label() { return t("Accent color"); },
    keywords: "highlight bubble send button tint",
  },
  {
    id: "diff-colors",
    section: "appearance",
    get label() { return t("Diff colors"); },
    keywords:
      "colorblind color blind accessibility added removed red green blue orange high contrast changes",
  },
  {
    id: "hue",
    section: "appearance",
    get label() { return t("Hue"); },
    keywords: "tint color chrome",
  },
  {
    id: "saturation",
    section: "appearance",
    get label() { return t("Saturation"); },
    keywords: "tint color neutral grey gray",
  },
  {
    id: "dark-lightness",
    section: "appearance",
    get label() { return t("Dark-mode lightness"); },
    keywords: "black brightness contrast background",
  },
  {
    id: "sidebar-opacity",
    section: "appearance",
    get label() { return t("Sidebar opacity"); },
    keywords: "glass translucent transparency vibrancy rail",
  },
  {
    id: "blur",
    section: "appearance",
    get label() { return t("Blur radius"); },
    keywords: "glass translucent vibrancy backdrop",
  },
  {
    id: "main-pane-glass",
    section: "appearance",
    get label() { return t("Main pane glass"); },
    keywords: "translucent transparency body window",
  },
  {
    id: "main-pane-opacity",
    section: "appearance",
    get label() { return t("Main pane opacity"); },
    keywords: "glass translucent transparency body window",
  },
  {
    id: "interface-scale",
    section: "appearance",
    get label() { return t("Interface scale"); },
    keywords: "zoom font size bigger smaller ui",
  },
  {
    id: "collapsed-project-rail",
    section: "appearance",
    get label() { return t("Collapsed project rail"); },
    keywords: "sidebar compact icons hidden navigation layout",
  },
  {
    id: "show-excluded-files",
    section: "appearance",
    get label() { return t("Show excluded files"); },
    keywords: "explorer gitignore ignored hidden files tree",
  },
  {
    id: "chat-background",
    section: "appearance",
    get label() { return t("Chat background"); },
    keywords: "wallpaper image picture opacity backdrop blur",
  },
  {
    id: "transcript-layout",
    section: "chat",
    get label() { return t("Transcript layout"); },
    keywords: "full width chat bubble message",
  },
  {
    id: "anchor-prompts",
    section: "chat",
    get label() { return t("Anchor prompts to top"); },
    keywords: "scroll position sticky message",
  },
  {
    id: "follow-up",
    section: "chat",
    get label() { return t("Follow-up behavior"); },
    keywords: "queue steer interrupt send while running",
  },
  {
    id: "resume-at-reset",
    section: "chat",
    get label() { return t("Resume at reset"); },
    keywords: "usage limit rate limit continue automatically wait",
  },
  {
    id: "auto-continue-interrupted",
    section: "chat",
    get label() { return t("Automatically continue interrupted turns"); },
    keywords: "restart quit resume continue where you left off cut off crash",
  },
  {
    id: "model-controls",
    section: "chat",
    get label() { return t("Model controls"); },
    keywords:
      "effort thinking reasoning fast service tier model picker composer",
  },
  {
    id: "format-on-save",
    section: "chat",
    get label() { return t("Format on save"); },
    keywords: "prettier quotes editor save format",
  },
  {
    id: "diff-view",
    section: "chat",
    get label() { return t("Diff view"); },
    keywords: "unified editor review changes working tree",
  },
  {
    id: "coffeehouse-scene",
    section: "chat",
    get label() { return t("Village coffeehouse"); },
    keywords:
      "coffeehouse village tea sohbet kahve çay amcalar dayılar ambient scene",
  },
  {
    id: "agent-clis",
    section: "providers",
    get label() { return t("Agent CLIs"); },
    keywords:
      "codex opencode cursor grok pi omp fx hermes antigravity gemini google binary path",
  },
  {
    id: "enabled-models",
    section: "providers",
    get label() { return t("Models"); },
    keywords:
      "model enable disable hide turn off sonnet opus haiku gpt default",
  },
  {
    id: "harness-updates",
    section: "providers",
    get label() { return t("CLI updates"); },
    keywords:
      "update upgrade version outdated latest release claude codex cursor grok opencode pi omp fx",
  },
  {
    id: "antigravity-account",
    section: "providers",
    get label() { return t("Antigravity CLI account"); },
    keywords:
      "google gemini antigravity agy install migration sign in login oauth account authentication api key",
  },
  {
    id: "provider-accounts",
    section: "providers",
    get label() { return t("Provider accounts"); },
    keywords:
      "account sign in login rename remove delete credentials profile color colour orange pink",
  },
  {
    id: "show-remaining-usage",
    section: "usage",
    get label() { return t("Show remaining usage"); },
    keywords: "usage limit meter bar left used quota percent",
  },
  {
    id: "mask-emails",
    section: "usage",
    get label() { return t("Mask account emails"); },
    keywords: "email privacy blur hide screenshot account",
  },
  {
    id: "provider-usage",
    section: "usage",
    get label() { return t("Usage"); },
    keywords: "usage tokens cost spend billing cache model project account",
  },
  {
    id: "claude-hooks",
    section: "providers",
    get label() { return t("Claude Code hooks"); },
    keywords: "pretooluse settings.json block command notification",
  },
  {
    id: "project-notifications",
    section: "inbox",
    get label() { return t("Project notifications"); },
    keywords: "mute resume sounds banners reminders categories",
  },
  {
    id: "github",
    section: "inbox",
    get label() { return t("GitHub"); },
    keywords: "gh cli connect pull request sign in",
  },
  {
    id: "gitlab",
    section: "inbox",
    get label() { return t("GitLab"); },
    keywords: "token self-managed merge request connect",
  },
  {
    id: "azuredevops",
    section: "inbox",
    get label() { return t("ADO"); },
    keywords: "azure devops boards repos pull request pat organization connect",
  },
  {
    id: "jira",
    section: "inbox",
    get label() { return t("Jira"); },
    keywords: "atlassian cloud site email api token issues projects connect",
  },
  {
    id: "linear",
    section: "inbox",
    get label() { return t("Linear"); },
    keywords: "api key issues teams connect",
  },
  {
    id: "show-archived",
    section: "archive",
    get label() { return t("Show archived in the sidebar"); },
    keywords: "hidden conversations list",
  },
];

export type SettingsSearchResult = {
  section: SettingsSectionId;
  sectionLabel: string;
  /** Row to scroll to, or `null` when the whole section matched. */
  settingId: string | null;
  label: string;
};

/** Ranks a label/keyword pair against a lowercased needle; `null` means no match. */
function matchScore(
  needle: string,
  label: string,
  keywords?: string,
): number | null {
  const labels = [label, ...sourceMessages(label)].map(value => value.toLowerCase());
  if (labels.some(value => value.startsWith(needle))) return 0;
  if (labels.some(value => value.includes(needle))) return 1;
  if (keywords?.toLowerCase().includes(needle)) return 2;
  return null;
}

/** Individual settings first, then whole sections, so a row wins its own name. */
export function searchSettings(
  query: string,
  limit = 8,
): SettingsSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored: { score: number; result: SettingsSearchResult }[] = [];

  for (const entry of SETTINGS_INDEX) {
    const score = matchScore(needle, entry.label, entry.keywords);
    if (score == null) continue;
    scored.push({
      score,
      result: {
        section: entry.section,
        sectionLabel: settingsSectionLabel(entry.section),
        settingId: entry.id,
        label: entry.label,
      },
    });
  }

  for (const section of SETTINGS_SECTIONS) {
    const score = matchScore(
      needle,
      section.label,
      `${section.description} ${section.keywords ?? ""}`,
    );
    if (score == null) continue;
    scored.push({
      score: score + 0.5,
      result: {
        section: section.id,
        sectionLabel: section.label,
        settingId: null,
        label: section.label,
      },
    });
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score || a.result.label.localeCompare(b.result.label),
    )
    .slice(0, limit)
    .map((item) => item.result);
}

export const SETTINGS_SECTION_DEFAULT: SettingsSectionId = "general";

export function isSettingsSectionId(
  value: unknown,
): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

export function settingsSectionLabel(id: SettingsSectionId): string {
  return (
    SETTINGS_SECTIONS.find((section) => section.id === id)?.label ?? "General"
  );
}

export function settingsSectionDescription(id: SettingsSectionId): string {
  return (
    SETTINGS_SECTIONS.find((section) => section.id === id)?.description ?? ""
  );
}

export function loadSettingsSection(): SettingsSectionId {
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    return isSettingsSectionId(raw) ? raw : SETTINGS_SECTION_DEFAULT;
  } catch {
    return SETTINGS_SECTION_DEFAULT;
  }
}

export function saveSettingsSection(id: SettingsSectionId) {
  try {
    localStorage.setItem(SECTION_KEY, id);
  } catch {
    // private mode / quota
  }
}

const FOLLOW_UP_BEHAVIOR_KEY = "monocode.followUpBehavior";

const COMPOSER_EFFORT_VISIBLE_KEY = "monocode.composerEffortVisible";

const MODEL_CONTROLS_KEY = "monocode.modelControls";

const FILE_TAB_MODE_KEY = "monocode.fileTabMode";

const TAB_ANIMATIONS_ENABLED_KEY = "monocode.tabAnimationsEnabled";

const COLLAPSED_PROJECT_RAIL_MODE_KEY = "monocode.collapsedProjectRailMode";

export type FollowUpBehavior = "steer" | "queue";

export const FOLLOW_UP_BEHAVIOR_DEFAULT: FollowUpBehavior = "steer";

export function loadFollowUpBehavior(): FollowUpBehavior {
  try {
    const raw = localStorage.getItem(FOLLOW_UP_BEHAVIOR_KEY);
    return raw === "queue" || raw === "steer"
      ? raw
      : FOLLOW_UP_BEHAVIOR_DEFAULT;
  } catch {
    return FOLLOW_UP_BEHAVIOR_DEFAULT;
  }
}

export function saveFollowUpBehavior(value: FollowUpBehavior) {
  try {
    localStorage.setItem(FOLLOW_UP_BEHAVIOR_KEY, value);
  } catch {
    // private mode / quota
  }
}

export type FileTabMode = "pane" | "workspace";

export const FILE_TAB_MODE_DEFAULT: FileTabMode = "pane";

/** Choose whether an ordinary file joins the active pane or gets a top tab. */
export function loadFileTabMode(): FileTabMode {
  try {
    const raw = localStorage.getItem(FILE_TAB_MODE_KEY);
    return raw === "pane" || raw === "workspace" ? raw : FILE_TAB_MODE_DEFAULT;
  } catch {
    return FILE_TAB_MODE_DEFAULT;
  }
}

export function saveFileTabMode(value: FileTabMode) {
  try {
    localStorage.setItem(FILE_TAB_MODE_KEY, value);
  } catch {
    // private mode / quota
  }
}

export const TAB_ANIMATIONS_ENABLED_DEFAULT = false;

export function loadTabAnimationsEnabled(): boolean {
  return readFlag(TAB_ANIMATIONS_ENABLED_KEY) ?? TAB_ANIMATIONS_ENABLED_DEFAULT;
}

export function saveTabAnimationsEnabled(value: boolean) {
  writeFlag(TAB_ANIMATIONS_ENABLED_KEY, value);
}

export type CollapsedProjectRailMode = "compact" | "hidden";

export const COLLAPSED_PROJECT_RAIL_MODE_DEFAULT: CollapsedProjectRailMode =
  "compact";

export const COLLAPSED_PROJECT_RAIL_MODE_CHANGE_EVENT =
  "monocode:collapsed-project-rail-mode-change";

export function loadCollapsedProjectRailMode(): CollapsedProjectRailMode {
  try {
    const raw = localStorage.getItem(COLLAPSED_PROJECT_RAIL_MODE_KEY);
    return raw === "compact" || raw === "hidden"
      ? raw
      : COLLAPSED_PROJECT_RAIL_MODE_DEFAULT;
  } catch {
    return COLLAPSED_PROJECT_RAIL_MODE_DEFAULT;
  }
}

export function saveCollapsedProjectRailMode(value: CollapsedProjectRailMode) {
  try {
    localStorage.setItem(COLLAPSED_PROJECT_RAIL_MODE_KEY, value);
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CollapsedProjectRailMode>(
      COLLAPSED_PROJECT_RAIL_MODE_CHANGE_EVENT,
      { detail: value },
    ),
  );
}

export function subscribeCollapsedProjectRailMode(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(
    COLLAPSED_PROJECT_RAIL_MODE_CHANGE_EVENT,
    onStoreChange,
  );
  return () =>
    window.removeEventListener(
      COLLAPSED_PROJECT_RAIL_MODE_CHANGE_EVENT,
      onStoreChange,
    );
}

export type ModelControls = "menu" | "beside";

export const MODEL_CONTROLS_DEFAULT: ModelControls = "menu";

/** Fired on `window` when the composer model controls setting flips. */
export const MODEL_CONTROLS_CHANGE_EVENT = "monocode:model-controls-change";

export function loadModelControls(): ModelControls {
  try {
    const raw = localStorage.getItem(MODEL_CONTROLS_KEY);
    if (raw === "menu" || raw === "beside") return raw;
    if (raw == null) {
      // Migrate the previous effort-control toggle: on means beside the picker.
      const legacy = localStorage.getItem(COMPOSER_EFFORT_VISIBLE_KEY);
      if (legacy === "1" || legacy === "true") return "beside";
    }
  } catch {
    // private mode / quota
  }
  return MODEL_CONTROLS_DEFAULT;
}

export function saveModelControls(value: ModelControls) {
  try {
    localStorage.setItem(MODEL_CONTROLS_KEY, value);
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ModelControls>(MODEL_CONTROLS_CHANGE_EVENT, {
      detail: value,
    }),
  );
}

export function subscribeModelControls(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(MODEL_CONTROLS_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(MODEL_CONTROLS_CHANGE_EVENT, onStoreChange);
}

const NOTES_ENABLED_KEY = "monocode.notesEnabled";

export const NOTES_ENABLED_DEFAULT = true;

/** Fired on `window` when the Notes UI setting flips. */
export const NOTES_ENABLED_CHANGE_EVENT = "monocode:notes-enabled-change";

export function loadNotesEnabled(): boolean {
  return readFlag(NOTES_ENABLED_KEY) ?? NOTES_ENABLED_DEFAULT;
}

export function saveNotesEnabled(value: boolean) {
  writeFlag(NOTES_ENABLED_KEY, value);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(NOTES_ENABLED_CHANGE_EVENT, { detail: value }),
  );
}

export function subscribeNotesEnabled(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NOTES_ENABLED_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(NOTES_ENABLED_CHANGE_EVENT, onStoreChange);
}

const QUICK_COMPOSER_ENABLED_KEY = "monocode.quickComposerEnabled";
const QUICK_COMPOSER_SHORTCUT_KEY = "monocode.quickComposerShortcut";

export const QUICK_COMPOSER_ENABLED_DEFAULT = true;

export function loadQuickComposerEnabled(): boolean {
  return readFlag(QUICK_COMPOSER_ENABLED_KEY) ?? QUICK_COMPOSER_ENABLED_DEFAULT;
}

export function saveQuickComposerEnabled(value: boolean) {
  writeFlag(QUICK_COMPOSER_ENABLED_KEY, value);
}

export function loadQuickComposerShortcut(): string {
  try {
    const value = localStorage.getItem(QUICK_COMPOSER_SHORTCUT_KEY);
    return value && isGlobalShortcut(value)
      ? value
      : QUICK_COMPOSER_DEFAULT_SHORTCUT;
  } catch {
    return QUICK_COMPOSER_DEFAULT_SHORTCUT;
  }
}

export function saveQuickComposerShortcut(value: string) {
  if (!isGlobalShortcut(value)) return;
  // Same conflict rules as every other row, so the separately stored Quick
  // Composer chord cannot claim a combination another command already owns.
  const shortcut = validateKeybindingShortcut(QUICK_COMPOSER_COMMAND, value);
  try {
    localStorage.setItem(QUICK_COMPOSER_SHORTCUT_KEY, shortcut);
  } catch {
    // private mode / quota
  }
}

const LIVE_AGENTS_ENABLED_KEY = "monocode.liveAgentsEnabled";

export const LIVE_AGENTS_ENABLED_DEFAULT = true;

/** Fired on `window` when the working-agents rail card setting flips. */
export const LIVE_AGENTS_ENABLED_CHANGE_EVENT =
  "monocode:live-agents-enabled-change";

export function loadLiveAgentsEnabled(): boolean {
  return readFlag(LIVE_AGENTS_ENABLED_KEY) ?? LIVE_AGENTS_ENABLED_DEFAULT;
}

export function saveLiveAgentsEnabled(value: boolean) {
  writeFlag(LIVE_AGENTS_ENABLED_KEY, value);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(LIVE_AGENTS_ENABLED_CHANGE_EVENT, {
      detail: value,
    }),
  );
}

export function subscribeLiveAgentsEnabled(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LIVE_AGENTS_ENABLED_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(LIVE_AGENTS_ENABLED_CHANGE_EVENT, onStoreChange);
}

const CLOSE_TO_TRAY_KEY = "monocode.closeToTray";

const KEEP_AWAKE_KEY = "monocode.keepAwakeWhileAgentsWork";
export const KEEP_AWAKE_DEFAULT = false;
export const KEEP_AWAKE_CHANGE_EVENT = "monocode:keep-awake-change";

export function loadKeepAwakeEnabled(): boolean {
  return readFlag(KEEP_AWAKE_KEY) ?? KEEP_AWAKE_DEFAULT;
}

export function saveKeepAwakeEnabled(value: boolean): void {
  writeFlag(KEEP_AWAKE_KEY, value);
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<boolean>(KEEP_AWAKE_CHANGE_EVENT, { detail: value }),
    );
}

export function subscribeKeepAwakeEnabled(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEEP_AWAKE_KEY || event.key === null) onChange();
  };
  window.addEventListener(KEEP_AWAKE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(KEEP_AWAKE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const KEEP_AWAKE_HOLD_AFTER = [
  { value: "0", get label() { return t("When it ends"); } },
  { value: "15m", get label() { return t("15 minutes"); } },
  { value: "30m", get label() { return t("30 minutes"); } },
  { value: "1h", get label() { return t("1 hour"); } },
  { value: "4h", get label() { return t("4 hours"); } },
  { value: "forever", get label() { return t("Forever"); } },
] as const;

export type KeepAwakeHoldAfter =
  (typeof KEEP_AWAKE_HOLD_AFTER)[number]["value"];

const KEEP_AWAKE_HOLD_AFTER_KEY = "monocode.keepAwakeHoldAfter";
export const KEEP_AWAKE_HOLD_AFTER_DEFAULT: KeepAwakeHoldAfter = "0";
export const KEEP_AWAKE_HOLD_AFTER_CHANGE_EVENT =
  "monocode:keep-awake-hold-after-change";

export function isKeepAwakeHoldAfter(
  value: unknown,
): value is KeepAwakeHoldAfter {
  return KEEP_AWAKE_HOLD_AFTER.some((option) => option.value === value);
}

export function keepAwakeHoldAfterMs(value: KeepAwakeHoldAfter): number {
  switch (value) {
    case "0":
      return 0;
    case "15m":
      return 15 * 60 * 1000;
    case "30m":
      return 30 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "4h":
      return 4 * 60 * 60 * 1000;
    case "forever":
      return Number.POSITIVE_INFINITY;
  }
}

export function loadKeepAwakeHoldAfter(): KeepAwakeHoldAfter {
  try {
    const raw = localStorage.getItem(KEEP_AWAKE_HOLD_AFTER_KEY);
    return isKeepAwakeHoldAfter(raw) ? raw : KEEP_AWAKE_HOLD_AFTER_DEFAULT;
  } catch {
    return KEEP_AWAKE_HOLD_AFTER_DEFAULT;
  }
}

export function saveKeepAwakeHoldAfter(value: KeepAwakeHoldAfter): void {
  try {
    localStorage.setItem(KEEP_AWAKE_HOLD_AFTER_KEY, value);
  } catch {
    // private mode / quota
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<KeepAwakeHoldAfter>(KEEP_AWAKE_HOLD_AFTER_CHANGE_EVENT, {
        detail: value,
      }),
    );
}

const REMOTE_AUTO_RECONNECT_KEY = "monocode.remoteAutoReconnect";
export const REMOTE_AUTO_RECONNECT_DEFAULT = true;
export const REMOTE_AUTO_RECONNECT_CHANGE_EVENT =
  "monocode:remote-auto-reconnect-change";

/** Whether dropped remote machines are retried in the background. */
export function loadRemoteAutoReconnect(): boolean {
  return readFlag(REMOTE_AUTO_RECONNECT_KEY) ?? REMOTE_AUTO_RECONNECT_DEFAULT;
}

export function saveRemoteAutoReconnect(value: boolean): void {
  writeFlag(REMOTE_AUTO_RECONNECT_KEY, value);
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<boolean>(REMOTE_AUTO_RECONNECT_CHANGE_EVENT, {
        detail: value,
      }),
    );
}

export function subscribeRemoteAutoReconnect(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === REMOTE_AUTO_RECONNECT_KEY || event.key === null)
      onChange();
  };
  window.addEventListener(REMOTE_AUTO_RECONNECT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(REMOTE_AUTO_RECONNECT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const KEEP_AWAKE_SCREEN_KEY = "monocode.keepAwakeScreen";
export const KEEP_AWAKE_SCREEN_DEFAULT = false;
export const KEEP_AWAKE_SCREEN_CHANGE_EVENT =
  "monocode:keep-awake-screen-change";

export function loadKeepAwakeScreen(): boolean {
  return readFlag(KEEP_AWAKE_SCREEN_KEY) ?? KEEP_AWAKE_SCREEN_DEFAULT;
}

export function saveKeepAwakeScreen(value: boolean): void {
  writeFlag(KEEP_AWAKE_SCREEN_KEY, value);
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<boolean>(KEEP_AWAKE_SCREEN_CHANGE_EVENT, {
        detail: value,
      }),
    );
}

export function subscribeKeepAwakeScreen(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEEP_AWAKE_SCREEN_KEY || event.key === null) onChange();
  };
  window.addEventListener(KEEP_AWAKE_SCREEN_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(KEEP_AWAKE_SCREEN_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function subscribeKeepAwakeHoldAfter(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEEP_AWAKE_HOLD_AFTER_KEY || event.key === null)
      onChange();
  };
  window.addEventListener(KEEP_AWAKE_HOLD_AFTER_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(KEEP_AWAKE_HOLD_AFTER_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const CLOSE_TO_TRAY_DEFAULT = true;

export function loadCloseToTray(): boolean {
  // Close to tray is Windows-only: nowhere else installs a tray icon.
  if (!IS_WIN) return false;
  return readFlag(CLOSE_TO_TRAY_KEY) ?? CLOSE_TO_TRAY_DEFAULT;
}

export function saveCloseToTray(value: boolean) {
  writeFlag(CLOSE_TO_TRAY_KEY, value);
}

const COFFEEHOUSE_SCENE_ENABLED_KEY = "imece.coffeehouseSceneEnabled";

export const COFFEEHOUSE_SCENE_ENABLED_DEFAULT = true;

/** Fired on `window` when the coffeehouse scene setting flips. */
export const COFFEEHOUSE_SCENE_ENABLED_CHANGE_EVENT =
  "imece:coffeehouse-scene-enabled-change";

export function loadCoffeehouseSceneEnabled(): boolean {
  return (
    readFlag(COFFEEHOUSE_SCENE_ENABLED_KEY) ?? COFFEEHOUSE_SCENE_ENABLED_DEFAULT
  );
}

export function saveCoffeehouseSceneEnabled(value: boolean) {
  writeFlag(COFFEEHOUSE_SCENE_ENABLED_KEY, value);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(COFFEEHOUSE_SCENE_ENABLED_CHANGE_EVENT, {
      detail: value,
    }),
  );
}

export function subscribeCoffeehouseSceneEnabled(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(
    COFFEEHOUSE_SCENE_ENABLED_CHANGE_EVENT,
    onStoreChange,
  );
  return () =>
    window.removeEventListener(
      COFFEEHOUSE_SCENE_ENABLED_CHANGE_EVENT,
      onStoreChange,
    );
}

const DIFF_VIEWER_KEY = "monocode.diffViewer";

export type DiffViewer = "editor" | "unified";

export const DIFF_VIEWER_DEFAULT: DiffViewer = "editor";

/** Fired on `window` when the working-tree diff layout flips. */
export const DIFF_VIEWER_CHANGE_EVENT = "monocode:diff-viewer-change";

function isDiffViewer(value: unknown): value is DiffViewer {
  return value === "editor" || value === "unified";
}

export function loadDiffViewer(): DiffViewer {
  try {
    const raw = localStorage.getItem(DIFF_VIEWER_KEY);
    return isDiffViewer(raw) ? raw : DIFF_VIEWER_DEFAULT;
  } catch {
    return DIFF_VIEWER_DEFAULT;
  }
}

export function saveDiffViewer(value: DiffViewer) {
  const next = isDiffViewer(value) ? value : DIFF_VIEWER_DEFAULT;
  try {
    localStorage.setItem(DIFF_VIEWER_KEY, next);
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DiffViewer>(DIFF_VIEWER_CHANGE_EVENT, { detail: next }),
  );
}

export function subscribeDiffViewer(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DIFF_VIEWER_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(DIFF_VIEWER_CHANGE_EVENT, onStoreChange);
}

const DIFF_LAYOUT_KEY = "monocode.diffLayout";

/** How a single file's changes are drawn: one column, or before | after. */
export type DiffLayout = "inline" | "split";

export const DIFF_LAYOUT_DEFAULT: DiffLayout = "inline";

/** Fired on `window` when the single-file diff layout flips. */
export const DIFF_LAYOUT_CHANGE_EVENT = "monocode:diff-layout-change";

function isDiffLayout(value: unknown): value is DiffLayout {
  return value === "inline" || value === "split";
}

export function loadDiffLayout(): DiffLayout {
  try {
    const raw = localStorage.getItem(DIFF_LAYOUT_KEY);
    return isDiffLayout(raw) ? raw : DIFF_LAYOUT_DEFAULT;
  } catch {
    return DIFF_LAYOUT_DEFAULT;
  }
}

export function saveDiffLayout(value: DiffLayout) {
  const next = isDiffLayout(value) ? value : DIFF_LAYOUT_DEFAULT;
  try {
    localStorage.setItem(DIFF_LAYOUT_KEY, next);
  } catch {
    // private mode / quota
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DiffLayout>(DIFF_LAYOUT_CHANGE_EVENT, { detail: next }),
  );
}

export function subscribeDiffLayout(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DIFF_LAYOUT_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(DIFF_LAYOUT_CHANGE_EVENT, onStoreChange);
}

const RESUME_AT_RESET_KEY = "monocode.resumeAtReset";

export const RESUME_AT_RESET_DEFAULT = true;

/** Whether a usage limit notice starts armed to continue at the reset. */
export function loadResumeAtReset(): boolean {
  return readFlag(RESUME_AT_RESET_KEY) ?? RESUME_AT_RESET_DEFAULT;
}

export function saveResumeAtReset(value: boolean) {
  writeFlag(RESUME_AT_RESET_KEY, value);
}

const FORMAT_ON_SAVE_KEY = "monocode.formatOnSave";

export const FORMAT_ON_SAVE_DEFAULT = true;

export function loadFormatOnSave(): boolean {
  return readFlag(FORMAT_ON_SAVE_KEY) ?? FORMAT_ON_SAVE_DEFAULT;
}

export function saveFormatOnSave(value: boolean) {
  writeFlag(FORMAT_ON_SAVE_KEY, value);
}

const AUTOSAVE_KEY = "monocode.autosave";
const AUTOSAVE_CHANGE_EVENT = "monocode:autosave-change";

export const AUTOSAVE_DEFAULT = false;

export function loadAutosave(): boolean {
  return readFlag(AUTOSAVE_KEY) ?? AUTOSAVE_DEFAULT;
}

export function saveAutosave(value: boolean): boolean {
  writeFlag(AUTOSAVE_KEY, value);
  const saved = loadAutosave();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTOSAVE_CHANGE_EVENT));
  }
  return saved;
}

export function subscribeAutosave(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === AUTOSAVE_KEY) onStoreChange();
  };
  window.addEventListener(AUTOSAVE_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTOSAVE_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

const CLAUDE_HOOKS_KEY = "monocode.claudeHooks";

export const CLAUDE_HOOKS_DEFAULT = true;

export function loadClaudeHooks(): boolean {
  return readFlag(CLAUDE_HOOKS_KEY) ?? CLAUDE_HOOKS_DEFAULT;
}

export function saveClaudeHooks(value: boolean) {
  writeFlag(CLAUDE_HOOKS_KEY, value);
}

const CTRL = IS_MAC ? "⌃" : "Ctrl+";

export type KeybindingRow = {
  command: string;
  keys: string;
  when: string;
};

/**
 * Mirrors the bindings we actually handle: the native menu accelerators in
 * `src-tauri/src/menu.rs`, `tabCommand`, the window key handler in App, and
 * focused surface handlers such as the draft composer workspace toggle.
 */
export const KEYBINDINGS: KeybindingRow[] = [
  { command: "App: Settings", keys: `${MOD},`, when: "Always" },
  { command: "App: Search", keys: `${MOD}K`, when: "Always" },
  { command: "App: Go to File", keys: `${MOD}P`, when: "Always" },
  { command: "App: Command Palette", keys: `${MOD}${SHIFT}P`, when: "Always" },
  { command: "App: Find in Files", keys: `${MOD}${SHIFT}F`, when: "Always" },
  { command: "App: Open Project", keys: `${MOD}O`, when: "Always" },
  { command: "App: New Window", keys: `${MOD}${SHIFT}N`, when: "Always" },
  ...(IS_MAC
    ? [
        {
          command: "App: Quick Composer",
          keys: `${MOD}${SHIFT}Space`,
          when: "Anywhere",
        },
      ]
    : []),
  { command: "App: Toggle Sidebar", keys: `${MOD}B`, when: "Always" },
  {
    command: "App: Toggle Session Sidebar",
    keys: `${MOD}${SHIFT}B`,
    when: "Always",
  },
  { command: "App: Switch Model", keys: `${MOD}.`, when: "Always" },
  {
    command: "Composer: Toggle Workspace",
    keys: `${MOD}${SHIFT}G`,
    when: "Draft session composer",
  },
  {
    command: "Composer: Queue Message",
    keys: `${SHIFT}Tab`,
    when: "textFocus && turnRunning && !popup",
  },
  { command: "View: Reload", keys: `${MOD}${SHIFT}R`, when: "Always" },
  { command: "View: Zoom In", keys: `${MOD}+`, when: "Always" },
  { command: "View: Zoom Out", keys: `${MOD}-`, when: "Always" },
  { command: "View: Reset Zoom", keys: `${MOD}0`, when: "Always" },
  { command: "Tab: New", keys: `${MOD}T`, when: "Always" },
  { command: "Tab: Close Others", keys: `${MOD}${ALT}T`, when: "Always" },
  { command: "Tab: Close All", keys: `${MOD}${SHIFT}W`, when: "Always" },
  { command: "Tab: Next", keys: `${MOD}${SHIFT}]`, when: "Always" },
  { command: "Tab: Previous", keys: `${MOD}${SHIFT}[`, when: "Always" },
  { command: "Tab: Cycle Next", keys: `${CTRL}Tab`, when: "Always" },
  {
    command: "Tab: Cycle Previous",
    keys: `${CTRL}${SHIFT}Tab`,
    when: "Always",
  },
  { command: "Tab: Back", keys: `${MOD}[`, when: "Always" },
  { command: "Tab: Forward", keys: `${MOD}]`, when: "Always" },
  { command: "Tab: Activate 1–8", keys: `${MOD}1 … ${MOD}8`, when: "Always" },
  { command: "Tab: Activate Last", keys: `${MOD}9`, when: "Always" },
  {
    command: "Session: Archive",
    keys: `${MOD}${SHIFT}A`,
    when: "sessionFocus && !overlay",
  },
  {
    command: "Session: Toggle Notes Panel",
    keys: `${MOD}N`,
    when: "sessionFocus && !overlay",
  },
  {
    command: "Session: Previous",
    keys: `${MOD}${SHIFT}↑`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Session: Next",
    keys: `${MOD}${SHIFT}↓`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Session: Previous in Current Tab",
    keys: `${MOD}↑`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Session: Next in Current Tab",
    keys: `${MOD}↓`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Project: Previous",
    keys: `${MOD}${SHIFT}←`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  {
    command: "Project: Next",
    keys: `${MOD}${SHIFT}→`,
    when: "!overlay && (!textFocus || emptyComposer)",
  },
  { command: "Pane: Close", keys: `${MOD}W`, when: "Always" },
  { command: "Pane: Split Right", keys: `${MOD}D`, when: "!editorFocus" },
  {
    command: "Pane: Split Down",
    keys: `${MOD}${SHIFT}D`,
    when: "!editorFocus",
  },
  { command: "Pane: Focus Left", keys: `${MOD}${ALT}←`, when: "Always" },
  { command: "Pane: Focus Right", keys: `${MOD}${ALT}→`, when: "Always" },
  { command: "Pane: Focus Up", keys: `${MOD}${ALT}↑`, when: "Always" },
  { command: "Pane: Focus Down", keys: `${MOD}${ALT}↓`, when: "Always" },
  { command: "Terminal: New", keys: `${MOD}\``, when: "Always" },
  { command: "Terminal: New Tab", keys: `${MOD}${SHIFT}\``, when: "Always" },
  { command: "Terminal: Toggle Dock", keys: `${MOD}J`, when: "Always" },
  { command: "Editor: Find", keys: `${MOD}F`, when: "editorFocus" },
  { command: "Editor: Replace", keys: `${MOD}${ALT}F`, when: "editorFocus" },
];

const KEYBINDING_OVERRIDES_KEY = "monocode.keybindingOverrides";
const KEYBINDINGS_CHANGE_EVENT = "monocode:keybindings-change";

export type KeybindingOverride = {
  disabled?: boolean;
  shortcut?: string;
};

export type KeybindingOverrides = Record<string, KeybindingOverride>;

const VALID_COMMANDS = new Set(KEYBINDINGS.map((row) => row.command));

const KEY_CODES: Record<string, string> = {
  " ": "Space",
  Enter: "Enter",
  Space: "Space",
  Tab: "Tab",
  "`": "Backquote",
  "[": "BracketLeft",
  "]": "BracketRight",
  ",": "Comma",
  ".": "Period",
  "+": "Equal",
  "-": "Minus",
  "\\": "Backslash",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
};

const DISPLAY_MODIFIERS: [string, string][] = IS_MAC
  ? [
      ["⌘", "Command"],
      ["⌃", "Control"],
      ["⌥", "Option"],
      ["⇧", "Shift"],
    ]
  : [
      ["Ctrl+", "Control"],
      ["Alt+", "Option"],
      ["Shift+", "Shift"],
    ];

const QUICK_COMPOSER_COMMAND = "App: Quick Composer";
const ACTIVATE_RANGE_COMMAND = "Tab: Activate 1–8";

/**
 * Every chord a command owns by default, in stored form. Grouped rows expand
 * to one chord per key so a rebind can never shadow a working shortcut.
 */
function defaultShortcutsFor(command: string): string[] {
  const row = KEYBINDINGS.find((entry) => entry.command === command);
  if (!row) return [];
  let rest = row.keys;
  const modifiers: string[] = [];
  for (const [display, modifier] of DISPLAY_MODIFIERS) {
    if (rest.startsWith(display)) {
      modifiers.push(modifier);
      rest = rest.slice(display.length);
    }
  }
  const chords = (code: string) => {
    const value = canonicalShortcut(
      modifiers.length ? [...modifiers, code].join("+") : code,
    );
    return value ? [value] : [];
  };
  if (row.keys.includes("…")) {
    return [1, 2, 3, 4, 5, 6, 7, 8].flatMap((digit) => chords(`Digit${digit}`));
  }
  if (/^[A-Za-z]$/.test(rest)) return chords(`Key${rest.toUpperCase()}`);
  if (/^[0-9]$/.test(rest)) return chords(`Digit${rest}`);
  if (KEY_CODES[rest]) return chords(KEY_CODES[rest]);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(rest)) return chords(rest);
  return [];
}

/** Chord to owning command, covering defaults, live overrides and Quick Composer. */
function shortcutOwners(): Map<string, string> {
  const owners = new Map<string, string>();
  for (const row of KEYBINDINGS) {
    // The Quick Composer chord is stored separately from the table.
    const chords =
      row.command === QUICK_COMPOSER_COMMAND
        ? [loadQuickComposerShortcut()]
        : defaultShortcutsFor(row.command);
    for (const chord of chords) owners.set(chord, row.command);
  }
  for (const [command, override] of Object.entries(loadKeybindingOverrides())) {
    if (override.shortcut) owners.set(override.shortcut, command);
  }
  return owners;
}

function validateShortcut(command: string, shortcut: string): string {
  const canonical = canonicalShortcut(shortcut);
  if (!canonical) throw new Error("That combination is not a valid shortcut");
  if (command === ACTIVATE_RANGE_COMMAND && !/Digit[1-8]$/.test(canonical)) {
    throw new Error("Tab: Activate 1–8 needs a number key from 1 to 8");
  }
  return canonical;
}

/** Shared by both save paths so no chord can be claimed twice. */
export function validateKeybindingShortcut(
  command: string,
  shortcut: string,
): string {
  const canonical = validateShortcut(command, shortcut);
  const owner = shortcutOwners().get(canonical);
  if (owner && owner !== command) {
    throw new Error(`Already used by ${owner}`);
  }
  return canonical;
}

let cacheStorage: Storage | null = null;
let cacheRaw: string | null = null;
let cacheValue: KeybindingOverrides = {};

function parseKeybindingOverrides(raw: string | null): KeybindingOverrides {
  const value = JSON.parse(raw ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: KeybindingOverrides = {};
  for (const [command, entry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!VALID_COMMANDS.has(command) || !entry || typeof entry !== "object")
      continue;
    const override = entry as { disabled?: unknown; shortcut?: unknown };
    const disabled = override.disabled === true;
    const shortcut =
      typeof override.shortcut === "string"
        ? (canonicalShortcut(override.shortcut) ?? undefined)
        : undefined;
    if (shortcut) next[command] = { shortcut };
    else if (disabled) next[command] = { disabled: true };
  }
  return next;
}

/** Cached per raw value: this runs several times on every keydown. Returns a fresh object. */
export function loadKeybindingOverrides(): KeybindingOverrides {
  try {
    const storage = localStorage;
    const raw = storage.getItem(KEYBINDING_OVERRIDES_KEY);
    if (cacheStorage === storage && cacheRaw === raw) return { ...cacheValue };
    const next = parseKeybindingOverrides(raw);
    cacheStorage = storage;
    cacheRaw = raw;
    cacheValue = next;
    return { ...next };
  } catch {
    return {};
  }
}

export function saveKeybindingOverride(
  command: string,
  override: KeybindingOverride,
): KeybindingOverrides {
  const next = loadKeybindingOverrides();
  if (override.disabled) next[command] = { disabled: true };
  else if (override.shortcut) {
    const shortcut = validateKeybindingShortcut(command, override.shortcut);
    next[command] = { shortcut };
  } else delete next[command];
  try {
    if (Object.keys(next).length) {
      localStorage.setItem(KEYBINDING_OVERRIDES_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(KEYBINDING_OVERRIDES_KEY);
    }
  } catch {
    throw new Error("Could not save shortcuts");
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(KEYBINDINGS_CHANGE_EVENT));
  }
  return next;
}

export type ShortcutEvent = Pick<KeyboardEvent, "code"> &
  Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

export function shortcutMatches(
  shortcut: string,
  event: ShortcutEvent,
): boolean {
  // Copy the fields: real keyboard events expose modifiers as prototype
  // accessors, so spreading the event would silently drop all of them.
  return (
    shortcutFromKeyEvent({
      code: event.code,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    }) === shortcut
  );
}

export function matchCustomKeybinding(event: ShortcutEvent): string | null {
  for (const [command, override] of Object.entries(loadKeybindingOverrides())) {
    if (override.shortcut && shortcutMatches(override.shortcut, event)) {
      return command;
    }
  }
  return null;
}

export function keybindingPressed(
  command: string,
  event: ShortcutEvent,
  defaultMatch: boolean,
): boolean {
  const override = loadKeybindingOverrides()[command];
  if (override?.disabled) return false;
  if (override?.shortcut) return shortcutMatches(override.shortcut, event);
  return defaultMatch;
}

export function keybindingShortcutLabel(
  command: string,
  fallback: string,
): string | null {
  const override = loadKeybindingOverrides()[command];
  if (override?.disabled) return null;
  return override?.shortcut
    ? quickComposerShortcutLabel(override.shortcut)
    : fallback;
}

export function keybindingShortcutTokens(
  command: string,
  fallback: string,
): string | null {
  const override = loadKeybindingOverrides()[command];
  if (override?.disabled) return null;
  return override?.shortcut ? shortcutTokens(override.shortcut) : fallback;
}

export function subscribeKeybindings(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEYBINDING_OVERRIDES_KEY) onStoreChange();
  };
  window.addEventListener(KEYBINDINGS_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(KEYBINDINGS_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function currentKeybindings(): KeybindingRow[] {
  const overrides = loadKeybindingOverrides();
  return KEYBINDINGS.map((row) => {
    if (row.command === "App: Quick Composer") {
      return {
        ...row,
        keys: loadQuickComposerEnabled()
          ? quickComposerShortcutLabel(loadQuickComposerShortcut())
          : "Disabled",
      };
    }
    const override = overrides[row.command];
    return {
      ...row,
      keys: override?.disabled
        ? "Disabled"
        : override?.shortcut
          ? quickComposerShortcutLabel(override.shortcut)
          : row.keys,
    };
  });
}

export function filterKeybindings(
  rows: KeybindingRow[],
  query: string,
): KeybindingRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (row) =>
      row.command.toLowerCase().includes(needle) ||
      row.keys.toLowerCase().includes(needle) ||
      row.when.toLowerCase().includes(needle),
  );
}

const INLINE_BLAME_KEY = "monocode.inlineBlame";

export const INLINE_BLAME_DEFAULT = false;

/** Fired on `window` when the editor's inline blame gutter is switched. */
export const INLINE_BLAME_CHANGE_EVENT = "monocode:inline-blame-change";

/** Whether editors show the per-line blame gutter. */
export function loadInlineBlame(): boolean {
  return readFlag(INLINE_BLAME_KEY) ?? INLINE_BLAME_DEFAULT;
}

export function saveInlineBlame(value: boolean) {
  writeFlag(INLINE_BLAME_KEY, value);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<boolean>(INLINE_BLAME_CHANGE_EVENT, { detail: value }),
  );
}

export function subscribeInlineBlame(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(INLINE_BLAME_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(INLINE_BLAME_CHANGE_EVENT, onStoreChange);
}

const AUTO_CONTINUE_INTERRUPTED_KEY = "monocode.autoContinueInterrupted";

export const AUTO_CONTINUE_INTERRUPTED_DEFAULT = true;

/**
 * Whether a turn that was cut off when MonoCode quit is continued on its own at
 * the next launch. Off leaves an "Interrupted - Continue" action on the chat.
 */
export function loadAutoContinueInterrupted(): boolean {
  return (
    readFlag(AUTO_CONTINUE_INTERRUPTED_KEY) ?? AUTO_CONTINUE_INTERRUPTED_DEFAULT
  );
}

export function saveAutoContinueInterrupted(value: boolean) {
  writeFlag(AUTO_CONTINUE_INTERRUPTED_KEY, value);
}
