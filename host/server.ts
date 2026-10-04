import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { hostname, homedir } from "node:os";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { promisify } from "node:util";
import {
  HOST_PROTOCOL_VERSION,
  type HostModelCatalog,
  type HostSession,
  type RemoteProvider,
  type SessionSync,
} from "../src/features/connections/model/protocol";
import { HostEngine, parseCommand } from "./engine";
import { HostAutomations } from "./automations";
import { HostTasks } from "./tasks";
import { HostGoals } from "./goals";
import { HostStewards } from "./stewards";
import { DesktopSessions } from "./desktopSessions";
import { branchCache } from "./git-actions";
import { withOverlay } from "./desktopLive";
import { writeAttachmentChunk, readAttachmentChunk } from "./attachments";
import type { LinkedWorkItem } from "../src/features/sessions/model/session";
import { parseGithubWorkItemUrl } from "../src/features/sessions/model/sessionWorkItem";
import { SyncTransfers } from "./sync-transfer";
import { syncPull, syncPush } from "./sync";
import type { SyncOp } from "../src/features/sync/model/syncProtocol";
import { browseHostDirectories } from "./browse";
import {
  createHostBranch,
  hostBranches,
  switchHostBranch,
} from "./git-branches";
import {
  createHostWorktree,
  hostWorktrees,
  resolveHostWorktreeAsync,
} from "./git-worktrees";
import {
  createHostPath,
  hostFileDiff,
  hostGitAction,
  hostGitIndex,
  indexHostFiles,
  listHostFiles,
  readHostFile,
  searchHostContent,
  searchHostFiles,
  writeHostFile,
} from "./workspace";
import { WorkspaceCommands } from "./workspace-commands";
import { discoverCodexModels } from "../src/integrations/harness/providers/codex/codexCatalog";
import { discoverClaudeModels } from "../src/integrations/harness/providers/claude/claudeCatalog";
import { discoverCursorModels } from "../src/integrations/harness/providers/cursor/cursorCatalog";
import { discoverGrokModels } from "../src/integrations/harness/providers/grok/grokCatalog";
import { discoverOpenCodeModels } from "../src/integrations/harness/providers/opencode/opencodeCatalog";
import {
  discoverPiModels,
  discoverOmpModels,
} from "../src/integrations/harness/providers/pi/piCatalog";
import { discoverFxModels } from "../src/integrations/harness/providers/fx/fxCatalog";
import { discoverHermesModels } from "../src/integrations/harness/providers/hermes/hermesCatalog";
import { discoverAntigravityModels } from "../src/integrations/harness/providers/antigravity/antigravityCatalog";
import {
  setHarnessModels,
  type AgentModel,
} from "../src/features/sessions/model/models";
import { listShellProfiles, setChosenProfile } from "./shellProfiles";
import {
  resolveAntigravityBinary,
  resolveClaudeBinary,
  resolveCodexBinary,
  resolveCursorBinary,
  resolveFxBinary,
  resolveGrokBinary,
  resolveHermesBinary,
  resolveOmpBinary,
  resolveOpenCodeBinary,
  resolvePiBinary,
} from "../src/integrations/harness/core/child";

const exec = promisify(execFile);
// Providers also add models server-side, without a CLI update.
const CATALOG_MAX_AGE_MS = 5 * 60_000;
const resolveBinary: Record<RemoteProvider, () => Promise<{ path: string }>> = {
  codex: () => resolveCodexBinary(),
  claude: () => resolveClaudeBinary(),
  cursor: () => resolveCursorBinary(),
  grok: () => resolveGrokBinary(),
  opencode: () => resolveOpenCodeBinary(),
  pi: () => resolvePiBinary(),
  omp: () => resolveOmpBinary(),
  fx: () => resolveFxBinary(),
  hermes: () => resolveHermesBinary(),
  antigravity: () => resolveAntigravityBinary(),
};
// A 1 MiB text file can expand to 6 MiB when JSON escapes control characters.
// Existing files.write sends both the original and replacement contents.
const MAX_BODY = 16 * 1024 * 1024;
const discoverModels: Record<
  RemoteProvider,
  (cwd: string) => Promise<AgentModel[]>
> = {
  codex: discoverCodexModels,
  claude: discoverClaudeModels,
  cursor: discoverCursorModels,
  grok: discoverGrokModels,
  opencode: discoverOpenCodeModels,
  pi: discoverPiModels,
  omp: discoverOmpModels,
  fx: discoverFxModels,
  hermes: discoverHermesModels,
  antigravity: discoverAntigravityModels,
};

async function body(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid request");
  return value as Record<string, unknown>;
}

/** Identifies each installed provider CLI. An update changes its real path or
 * modification time, which invalidates the catalog the old version reported. */
async function providerBinaries(providers: RemoteProvider[]): Promise<string> {
  const binaries = await Promise.all(
    providers.map(async (provider) => {
      try {
        const file = await realpath((await resolveBinary[provider]()).path);
        return `${file}:${(await stat(file)).mtimeMs}`;
      } catch {
        return "";
      }
    }),
  );
  return binaries.join("\n");
}

/** Run id watchers use for a turn the desktop app is running. */
const DESKTOP_RUN_ID = "desktop";
const MAX_DESKTOP_VIEWS = 32;

export function createHostServer(
  engine: HostEngine,
  providers: RemoteProvider[],
  lifecycle?: (request: IncomingMessage, response: ServerResponse) => void,
  automations = new HostAutomations(engine.store, engine),
  tasks = new HostTasks(engine.store, engine),
  desktop = new DesktopSessions(),
  goals = new HostGoals(engine.store, engine, tasks),
  stewards = new HostStewards(engine.store, engine, tasks),
) {
  const inHost = (id: string) => {
    try {
      engine.store.session(id);
      return true;
    } catch {
      return false;
    }
  };
  /** A desktop-only session on this machine, matched to a registered project. */
  const desktopSnapshot = (id: string) => {
    if (!id || inHost(id)) return undefined;
    const cwd = desktop.projectCwd(id);
    const project = cwd
      ? engine.store.projects().find((p) => desktop.samePath(p.cwd, cwd))
      : undefined;
    const snapshot = project && desktop.snapshot(id, project.id);
    return snapshot &&
      providers.includes(snapshot.session.harness as RemoteProvider)
      ? snapshot
      : undefined;
  };
  const adopt = (id: string) => {
    const snapshot = desktopSnapshot(id);
    if (snapshot) engine.adoptSession(snapshot);
    else refresh(id);
  };
  /** Pulls turns the desktop app ran in an adopted session since. */
  const refresh = (
    id: string,
    known?: { updatedAt: number; running: boolean },
  ) => {
    let current;
    try {
      current = engine.store.session(id);
    } catch {
      return;
    }
    if (!current.desktop) return;
    const stamp = known ?? desktop.stamp(id);
    if (!stamp) return;
    if (stamp.running)
      throw new Error(
        "This session is running in MonoCode on that computer. Wait for it to finish.",
      );
    if (stamp.updatedAt <= current.desktop.updatedAt) return;
    const snapshot = desktop.snapshot(id, current.projectId);
    if (snapshot) engine.refreshFromDesktop(snapshot);
  };
  /** Where watchers of `id` should look: the desktop app's copy for a
   * desktop-only session, or for an adopted one the app is running a turn in. */
  const desktopWatch = (id: string) => {
    if (!id) return undefined;
    let hosted: HostSession | undefined;
    try {
      hosted = engine.store.session(id);
    } catch {
      /* desktop-only */
    }
    if (hosted && !hosted.desktop) return undefined;
    const stamp = desktop.stamp(id);
    if (!stamp) return undefined;
    if (hosted && (!stamp.running || hosted.status === "running"))
      return undefined;
    const overlay = desktop.live.overlay(id);
    return {
      projectId: hosted?.projectId,
      running: stamp.running,
      revision: Math.max(stamp.updatedAt, overlay?.changedAt ?? 0),
    };
  };
  /** The desktop copy with its live prompts; a running one carries a run id
   * so watchers can stop it and answer its prompts. */
  const desktopView = (
    id: string,
    projectId?: string,
  ): HostSession | undefined => {
    const snapshot = projectId
      ? desktop.snapshot(id, projectId)
      : desktopSnapshot(id);
    if (!snapshot) return undefined;
    const overlay = desktop.live.overlay(id);
    return {
      ...snapshot,
      revision: Math.max(snapshot.revision, overlay?.changedAt ?? 0),
      ...(snapshot.status === "running" ? { runId: DESKTOP_RUN_ID } : {}),
      session: withOverlay(snapshot.session, overlay),
    };
  };
  /** Per-block change revisions of watched desktop copies, so a watcher
   * fetches only what changed, as for the host's own sessions. */
  const views = new Map<
    string,
    {
      revision: number;
      first: number;
      revs: Map<string, number>;
      json: Map<string, string>;
    }
  >();
  const desktopSync = (view: HostSession, client?: number): SessionSync => {
    const id = view.session.id;
    let entry = views.get(id);
    if (!entry || entry.revision !== view.revision) {
      const revs = new Map<string, number>();
      const json = new Map<string, string>();
      for (const block of view.session.blocks) {
        const text = JSON.stringify(block);
        json.set(block.id, text);
        revs.set(
          block.id,
          entry && entry.json.get(block.id) === text
            ? entry.revs.get(block.id)!
            : view.revision,
        );
      }
      entry = {
        revision: view.revision,
        first: entry?.first ?? view.revision,
        revs,
        json,
      };
      views.delete(id);
      views.set(id, entry);
      if (views.size > MAX_DESKTOP_VIEWS)
        views.delete(views.keys().next().value!);
    }
    if (client === view.revision)
      return { kind: "unchanged", revision: client };
    if (client === undefined || client < entry.first || client > view.revision)
      return { kind: "snapshot", value: view };
    const {
      session: { blocks, ...session },
      ...rest
    } = view;
    const revs = entry.revs;
    return {
      kind: "delta",
      base: client,
      value: { ...rest, session },
      blockIds: blocks.map((block) => block.id),
      blocks: blocks.filter(
        (block) => (revs.get(block.id) ?? view.revision) > client,
      ),
    };
  };
  /** Like `refresh`, for reads: a running desktop turn just isn't pulled yet. */
  const catchUp = (
    id: string,
    known?: { updatedAt: number; running: boolean },
  ) => {
    try {
      refresh(id, known);
    } catch {
      /* the desktop is mid-turn; serve the host copy */
    }
  };
  const catalogs = new Map<
    string,
    { binaries: string; probed: number; catalog: Promise<HostModelCatalog> }
  >();
  const transfers = new SyncTransfers();
  const workspace = new WorkspaceCommands(engine.store, (projectId, action) =>
    engine.withIdleProject(projectId, action),
  );
  const models = async (projectId?: unknown) => {
    const cwd =
      typeof projectId === "string"
        ? engine.store.project(projectId).cwd
        : homedir();
    const binaries = await providerBinaries(providers);
    const cached = catalogs.get(cwd);
    let catalog =
      cached?.binaries === binaries &&
      Date.now() - cached.probed < CATALOG_MAX_AGE_MS
        ? cached.catalog
        : undefined;
    if (!catalog) {
      catalog = (async () => {
        const result: HostModelCatalog = { models: {}, errors: {} };
        await Promise.all(
          providers.map(async (provider) => {
            try {
              const discovered = await discoverModels[provider](cwd);
              result.models[provider] = discovered;
              if (discovered.length) setHarnessModels(provider, discovered);
            } catch (error) {
              result.errors[provider] =
                error instanceof Error ? error.message : String(error);
            }
          }),
        );
        return result;
      })().then(
        (result) => {
          if (
            Object.keys(result.errors).length &&
            catalogs.get(cwd)?.catalog === catalog
          )
            catalogs.delete(cwd);
          return result;
        },
        (error) => {
          if (catalogs.get(cwd)?.catalog === catalog) catalogs.delete(cwd);
          throw error;
        },
      );
      catalogs.set(cwd, { binaries, probed: Date.now(), catalog });
    }
    return catalog;
  };
  const server = createServer(
    { requestTimeout: 20_000, headersTimeout: 10_000, maxHeaderSize: 8192 },
    async (request, response) => {
      if (request.url === "/lifecycle" && lifecycle) {
        lifecycle(request, response);
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      try {
        // Desktop native HTTP supplies credentials. This endpoint intentionally
        // accepts no browser origin and provides no permissive CORS escape hatch.
        if (
          request.headers.origin ||
          request.method !== "POST" ||
          request.url !== "/rpc"
        ) {
          response
            .writeHead(403)
            .end(
              JSON.stringify({ error: "Unsupported request origin or route" }),
            );
          return;
        }
        const token = request.headers.authorization?.match(
          /^Bearer ([A-Za-z0-9_-]{43})$/,
        )?.[1];
        if (!token || !engine.store.authenticated(token)) {
          response.writeHead(401).end(
            JSON.stringify({
              error: "Device credential is invalid or revoked",
            }),
          );
          return;
        }
        const input = await body(request);
        // Reading a request body yields: a device may have been revoked since
        // the headers arrived. Reject it before dispatching any operation.
        if (!engine.store.authenticated(token)) {
          response.writeHead(401).end(
            JSON.stringify({
              error: "Device credential is invalid or revoked",
            }),
          );
          return;
        }
        if (input.version !== HOST_PROTOCOL_VERSION)
          throw new Error("Incompatible protocol version");
        if (
          input.method !== "environment.describe" &&
          input.environmentId !== engine.store.environmentId
        )
          throw new Error(
            "Host identity changed; reconnect this machine explicitly",
          );
        const params =
          input.params &&
          typeof input.params === "object" &&
          !Array.isArray(input.params)
            ? (input.params as Record<string, unknown>)
            : {};
        let result: unknown;
        switch (input.method) {
          case "environment.describe":
            result = {
              protocolVersion: HOST_PROTOCOL_VERSION,
              environmentId: engine.store.environmentId,
              name: hostname(),
              platform: process.platform,
              // Older clients validate this list against Codex and Claude only.
              providers: providers.filter((provider) =>
                Array.isArray(params.supportedProviders)
                  ? params.supportedProviders.includes(provider)
                  : provider === "codex" || provider === "claude",
              ),
              capabilities: [
                "sessions",
                "sessions.harnessSwitch",
                "projects.browse",
                "models.list",
                "approvals",
                "questions",
                "diff",
                "git.branches",
                "git.switch",
                "git.createBranch",
                "git.worktrees",
                "git.worktreeCreate",
                "files.read",
                "files.list",
                "files.index",
                "workspace.run",
                "files.search",
                "files.searchContent",
                "files.create",
                "files.write",
                "git.index",
                "git.fileDiff",
                "git.action",
                "git.actions",
                "git.conflicts",
                "attachments.upload",
                "attachments.read",
                "sessions.draft",
                "sessions.plan",
                "sessions.shell",
                "shell.profiles",
                "sessions.desktop",
                "sessions.desktopLive",
                "sync",
                "automations",
                "tasks",
                "tasks.todo",
                "goals",
                "stewards",
                "host.settings",
              ],
            };
            break;
          case "projects.list":
            result = engine.store.projects();
            break;
          case "projects.browse":
            result = await browseHostDirectories(params.path);
            break;
          case "projects.open":
            result = await engine.openProject(String(params.cwd ?? ""));
            break;
          case "shell.profiles":
            result = listShellProfiles();
            break;
          case "shell.setProfile":
            setChosenProfile(
              typeof params.profile === "string" && params.profile.trim()
                ? params.profile.trim()
                : null,
            );
            result = listShellProfiles();
            break;
          case "models.list":
            result = await models(params.projectId);
            break;
          case "sessions.list": {
            const projectId = String(params.projectId ?? "");
            const project = engine.store.project(projectId);
            const local = desktop.list(project.cwd, projectId, providers);
            const stamps = new Map(
              local.map((session) => [session.id, session]),
            );
            for (const adopted of engine.store.adopted()) {
              const stamp = stamps.get(adopted.id);
              if (adopted.projectId === projectId && stamp)
                catchUp(adopted.id, {
                  updatedAt: stamp.updatedAt,
                  running: stamp.status === "running",
                });
            }
            // An adopted session the desktop app is running a turn in.
            const own = engine.store
              .summaries(projectId)
              .map((session) =>
                session.status !== "running" &&
                stamps.get(session.id)?.status === "running"
                  ? { ...session, status: "running" as const }
                  : session,
              );
            const known = new Set(own.map((session) => session.id));
            const summaries = [
              ...own,
              ...local.filter((session) => !known.has(session.id)),
            ].sort((a, b) => b.updatedAt - a.updatedAt);
            const paths = [
              ...new Set(
                summaries.map((session) => session.cwd ?? project.cwd),
              ),
            ];
            const branches = new Map(
              await Promise.all(
                paths.map(
                  async (cwd) => [cwd, await branchCache.get(cwd)] as const,
                ),
              ),
            );
            const list = summaries.map((session) => ({
              ...session,
              repo: project.name,
              branch: branches.get(session.cwd ?? project.cwd) || undefined,
              worktreeCwd:
                session.cwd && session.cwd !== project.cwd
                  ? session.cwd
                  : undefined,
            }));
            // A client that sends `known` can take "unchanged" instead of the
            // array. Clients that omit it keep getting the plain array.
            if (typeof params.known === "string") {
              const etag = createHash("sha256")
                .update(JSON.stringify(list))
                .digest("base64url");
              result =
                params.known === etag
                  ? { unchanged: true, etag }
                  : { etag, sessions: list };
            } else result = list;
            break;
          }
          case "sessions.update": {
            const sessionId = String(params.sessionId ?? "");
            adopt(sessionId);
            const current = engine.store.session(sessionId);
            if (current.projectId !== params.projectId)
              throw new Error("Session does not belong to this project");
            const patch: {
              title?: string;
              archived?: boolean;
              pinned?: boolean;
              linkedWorkItem?: LinkedWorkItem | null;
            } = {};
            if (params.title !== undefined) {
              if (typeof params.title !== "string")
                throw new Error("Invalid session title");
              patch.title = params.title;
            }
            if (params.archived !== undefined) {
              if (typeof params.archived !== "boolean")
                throw new Error("Invalid archive value");
              patch.archived = params.archived;
            }
            if (params.pinned !== undefined) {
              if (typeof params.pinned !== "boolean")
                throw new Error("Invalid pin value");
              patch.pinned = params.pinned;
            }
            if (params.linkedWorkItem !== undefined) {
              const item = params.linkedWorkItem;
              const parsed =
                item && typeof item === "object" && !Array.isArray(item)
                  ? parseGithubWorkItemUrl(
                      String((item as LinkedWorkItem).url ?? ""),
                    )
                  : null;
              if (
                item !== null &&
                (typeof item !== "object" ||
                  Array.isArray(item) ||
                  !parsed ||
                  parsed.kind !== (item as LinkedWorkItem).kind ||
                  parsed.repo !== (item as LinkedWorkItem).repo ||
                  parsed.number !== (item as LinkedWorkItem).number ||
                  parsed.url !== (item as LinkedWorkItem).url)
              )
                throw new Error("Invalid linked work item");
              patch.linkedWorkItem = item as LinkedWorkItem | null;
            }
            if (Object.keys(patch).length === 0)
              throw new Error("No session changes supplied");
            result = engine.updateSession(sessionId, patch);
            break;
          }
          case "sessions.delete": {
            const sessionId = String(params.sessionId ?? "");
            if (desktopSnapshot(sessionId))
              throw new Error(
                "This session belongs to the MonoCode app on that computer; delete it there.",
              );
            const current = engine.store.session(sessionId);
            if (current.projectId !== params.projectId)
              throw new Error("Session does not belong to this project");
            engine.store.deleteSession(sessionId);
            result = { deleted: true };
            break;
          }
          case "sessions.sync": {
            const sessionId = String(params.sessionId ?? "");
            const revision = Number.isSafeInteger(params.revision)
              ? Number(params.revision)
              : undefined;
            const watch = desktopWatch(sessionId);
            if (watch) {
              // Watching a desktop turn polls fast; skip the transcript read
              // while the desktop copy hasn't changed.
              if (revision === watch.revision) {
                result = { kind: "unchanged", revision };
                break;
              }
              const view = desktopView(sessionId, watch.projectId);
              if (view) {
                result = transfers.respond(
                  sessionId,
                  desktopSync(view, revision),
                );
                break;
              }
            }
            catchUp(sessionId);
            result = transfers.respond(
              sessionId,
              engine.store.sync(sessionId, revision),
            );
            break;
          }
          case "sessions.desktopLive":
            result = desktop.live.beat(params);
            break;
          case "sessions.adopted":
            result = engine.store.adopted();
            break;
          case "sessions.syncChunk":
            result = transfers.chunk(
              String(params.sessionId ?? ""),
              String(params.transfer ?? ""),
              Number(params.offset),
            );
            break;
          case "sessions.get": {
            const id = String(params.sessionId ?? "");
            const watch = desktopWatch(id);
            const value =
              (watch && desktopView(id, watch.projectId)) ??
              engine.store.session(id);
            result = value.revision === params.revision ? null : value;
            break;
          }
          case "events.read": {
            if (!Number.isSafeInteger(params.after) || Number(params.after) < 0)
              throw new Error("Invalid event cursor");
            result = engine.store.events(
              String(params.sessionId ?? ""),
              Number(params.after),
            );
            break;
          }
          case "commands.dispatch": {
            const sessionId = String(params.sessionId ?? "");
            // Stopping or answering a turn the desktop app runs: leave it for
            // the app, which picks it up with its next heartbeat.
            if (
              params.type === "cancel" ||
              params.type === "approve" ||
              params.type === "answer"
            ) {
              const watch = desktopWatch(sessionId);
              if (watch?.running) {
                if (!desktop.live.alive())
                  throw new Error(
                    "The MonoCode app on that computer isn't responding. Try again when it's open.",
                  );
                const command = parseCommand(params);
                if (
                  command.type === "cancel" ||
                  command.type === "approve" ||
                  command.type === "answer"
                )
                  desktop.live.enqueue(command);
                result = {
                  commandId: command.commandId,
                  sessionId,
                  revision: watch.revision,
                };
                break;
              }
            }
            if (params.type !== "create") adopt(sessionId);
            result = engine.command(params);
            break;
          }
          case "sync.pull": {
            const sinceRev = Number.isSafeInteger(params.sinceRev)
              ? Number(params.sinceRev)
              : 0;
            result = syncPull(
              engine.store.db,
              sinceRev,
              params.paginated === true
                ? {
                    untilRev:
                      Number.isSafeInteger(params.untilRev) &&
                      Number(params.untilRev) >= sinceRev
                        ? Number(params.untilRev)
                        : undefined,
                  }
                : undefined,
            );
            break;
          }
          case "sync.push": {
            if (!Array.isArray(params.ops)) throw new Error("Invalid sync ops");
            result = engine.store.transaction(() =>
              syncPush(engine.store.db, params.ops as SyncOp[]),
            );
            break;
          }
          case "automations.list":
            result = automations.list();
            break;
          case "automations.save":
            result = automations.save(params.automation);
            break;
          case "automations.delete":
            automations.delete(String(params.automationId ?? ""));
            result = { deleted: true };
            break;
          case "automations.runs":
            result = automations.runs(String(params.automationId ?? ""));
            break;
          case "automations.runNow":
            result = automations.runNow(String(params.automationId ?? ""));
            break;
          case "tasks.list":
            result = tasks.list();
            break;
          case "tasks.save":
            result = tasks.save(params.task);
            break;
          case "tasks.move":
            result = await tasks.move(String(params.taskId ?? ""), params.to);
            break;
          case "tasks.delete":
            await tasks.delete(
              String(params.taskId ?? ""),
              params.discard === true,
            );
            result = { deleted: true };
            break;
          case "goals.list":
            result = goals.list();
            break;
          case "goals.create":
            result = goals.create(params.goal);
            break;
          case "goals.approve":
            result = goals.approve(String(params.goalId ?? ""));
            break;
          case "goals.replan":
            result = goals.replan(String(params.goalId ?? ""), params.feedback);
            break;
          case "goals.cancel":
            result = await goals.cancel(String(params.goalId ?? ""));
            break;
          case "goals.delete":
            await goals.delete(
              String(params.goalId ?? ""),
              params.withTasks === true,
            );
            result = { deleted: true };
            break;
          case "host.settings.get":
            result = tasks.limits.state();
            break;
          case "host.settings.save":
            tasks.limits.save(params.settings);
            result = tasks.limits.state();
            void tasks.tick();
            break;
          case "stewards.list":
            result = stewards.list();
            break;
          case "stewards.save":
            result = stewards.save(params.steward);
            break;
          case "stewards.delete":
            await stewards.delete(String(params.stewardId ?? ""));
            result = { deleted: true };
            break;
          case "stewards.runNow":
            result = await stewards.runNow(String(params.stewardId ?? ""));
            break;
          case "stewards.decline":
            await stewards.decline(String(params.taskId ?? ""));
            result = { declined: true };
            break;
          case "attachments.upload":
            result = writeAttachmentChunk(engine.store, params);
            break;
          case "attachments.read":
            result = readAttachmentChunk(engine.store, params);
            break;
          case "devices.revokeSelf":
            // Only the caller's own credential. Sessions and other devices
            // are unaffected; the host keeps running.
            result = { revoked: engine.store.revokeToken(token) };
            break;
          case "git.diff": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            const diff = await exec(
              "git",
              [
                "-c",
                "core.pager=cat",
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "HEAD",
                "--",
              ],
              {
                cwd: await resolveHostWorktreeAsync(project.cwd, params.cwd),
                timeout: 10_000,
                maxBuffer: 2 * 1024 * 1024,
              },
            );
            result = diff.stdout;
            break;
          }
          case "git.branches": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await hostBranches(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
            );
            break;
          }
          case "git.switch": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            const cwd = await resolveHostWorktreeAsync(project.cwd, params.cwd);
            result = await engine.withIdleProject(project.id, () =>
              switchHostBranch(cwd, params.branch, params.remote),
            );
            break;
          }
          case "git.createBranch": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            const cwd = await resolveHostWorktreeAsync(project.cwd, params.cwd);
            result = await engine.withIdleProject(project.id, () =>
              createHostBranch(cwd, params.branch),
            );
            break;
          }
          case "git.worktrees": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await hostWorktrees(project.cwd);
            break;
          }
          case "git.worktreeCreate": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            const cwd = await resolveHostWorktreeAsync(project.cwd, params.cwd);
            result = await engine.withIdleProject(project.id, () =>
              createHostWorktree(
                project.cwd,
                params.branch,
                params.base,
                params.existing,
                cwd,
              ),
            );
            workspace.invalidateRoots();
            break;
          }
          case "files.read": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await readHostFile(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
              params.path,
            );
            break;
          }
          case "files.list": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await listHostFiles(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
              params.path,
            );
            break;
          }
          case "files.index": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await indexHostFiles(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
            );
            break;
          }
          case "workspace.run":
            result = (await workspace.run(params.command, params.args)) ?? null;
            break;
          case "files.search": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await searchHostFiles(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
              params.query,
            );
            break;
          }
          case "files.searchContent": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await searchHostContent(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
              params,
            );
            break;
          }
          case "files.create": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await createHostPath(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
              params.parent,
              params.name,
              params.isDir,
            );
            break;
          }
          case "files.write": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result =
              (await writeHostFile(
                await resolveHostWorktreeAsync(project.cwd, params.cwd),
                params.path,
                params.expected,
                params.content,
              )) ?? null;
            break;
          }
          case "git.index": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await hostGitIndex(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
            );
            break;
          }
          case "git.fileDiff": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            result = await hostFileDiff(
              await resolveHostWorktreeAsync(project.cwd, params.cwd),
              params.path,
              params.staged === true,
            );
            break;
          }
          case "git.action": {
            const project = engine.store.project(
              String(params.projectId ?? ""),
            );
            const cwd = await resolveHostWorktreeAsync(project.cwd, params.cwd);
            result =
              (await engine.withIdleProject(project.id, () =>
                hostGitAction(
                  cwd,
                  params.action,
                  params.path,
                  params.message,
                  params.content,
                ),
              )) ?? null;
            break;
          }
          default:
            throw new Error("Unsupported host method");
        }
        response.end(JSON.stringify({ result }));
      } catch (error) {
        if (!response.destroyed)
          response.writeHead(400).end(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : "Host request failed",
            }),
          );
      }
    },
  );
  // Cached read-only desktop connections would keep the files locked.
  server.on("close", () => desktop.close());
  return server;
}
