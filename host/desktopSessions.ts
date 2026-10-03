import { DatabaseSync } from "node:sqlite";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type {
  HostSession,
  HostSessionSummary,
  RemoteProvider,
} from "../src/features/connections/model/protocol";
import type { Block, Session } from "../src/features/sessions/model/session";
import { DesktopLive } from "./desktopLive";

const IDENTIFIERS = [
  "com.monocode.desktop",
  "com.monocode.desktop.fork",
  "com.monocode.desktop.dev",
];

/** Tauri's app data directories, one per identifier, for this platform. */
export function desktopDatabasePaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string[] {
  const override = env.MONOCODE_DESKTOP_DB;
  if (override)
    return override.split(delimiter).filter(Boolean).filter((p) => existsSync(p));
  const base =
    platform === "win32"
      ? env.APPDATA || join(home, "AppData", "Roaming")
      : platform === "darwin"
        ? join(home, "Library", "Application Support")
        : env.XDG_DATA_HOME || join(home, ".local", "share");
  return IDENTIFIERS.map((id) => join(base, id, "monocode.db")).filter((p) =>
    existsSync(p),
  );
}

export function normalizeProjectPath(
  path: string,
  platform: NodeJS.Platform = process.platform,
): string {
  let value = path;
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\"))
    value = join(homedir(), value.slice(1));
  try {
    value = realpathSync.native(value);
  } catch {
    /* project folder may be gone; compare as written */
  }
  value = value.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  return platform === "win32" || platform === "darwin"
    ? value.toLowerCase()
    : value;
}

type Row = Record<string, unknown>;
type Found = { row: Row; inFlight: boolean };

/**
 * Read-only view of the sessions the MonoCode desktop app keeps on this
 * machine. The desktop is the only writer; this never writes.
 */
export class DesktopSessions {
  constructor(
    private readonly paths: () => string[] = () => desktopDatabasePaths(),
    private readonly platform: NodeJS.Platform = process.platform,
    /** The app's heartbeat: running state and live prompts. */
    readonly live = new DesktopLive(),
  ) {}

  /** Running per the app's heartbeat; the database's in-flight mark (which a
   * crashed app leaves behind) only counts for an app without one. */
  private isRunning(id: string, stored: boolean): boolean {
    return this.live.running(id, stored);
  }

  /** Opens per call: desktop databases are small and may appear or move. */
  private query<T>(path: string, run: (db: DatabaseSync) => T): T | undefined {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path, { readOnly: true });
      db.exec("PRAGMA busy_timeout=2000");
      return run(db);
    } catch (error) {
      console.error("Could not read desktop sessions:", error);
      return undefined;
    } finally {
      try {
        db?.close();
      } catch {
        /* already closed */
      }
    }
  }

  private rows(
    db: DatabaseSync,
    where: string,
    args: string[],
    blocks = true,
  ): Found[] {
    const columns = new Set(
      db.prepare("PRAGMA table_info(sessions)").all().map((c) => String(c.name)),
    );
    if (!columns.has("id") || !columns.has("blocks_json")) return [];
    const optional = (name: string, fallback = "NULL") =>
      columns.has(name) ? name : `${fallback} AS ${name}`;
    const sql = `SELECT id, cwd, harness, model, model_settings, runtime_mode, title,
      provider_session_id, ${blocks ? "blocks_json" : "NULL AS blocks_json"},
      created_at, updated_at,
      ${optional("branch")}, ${optional("archived", "0")}, ${optional("worktree_cwd")},
      ${optional("has_user_message", "1")}, ${optional("pinned", "0")},
      ${optional("linked_work_item_json")}, ${optional("provider_account_id")},
      ${optional("is_draft", "0")}, ${optional("inbox_ask")}
      FROM sessions WHERE ${where}`;
    const running = new Set<string>();
    try {
      for (const r of db.prepare("SELECT session_id FROM in_flight_sessions").all())
        running.add(String(r.session_id));
    } catch {
      /* older desktop without the table */
    }
    return db
      .prepare(sql)
      .all(...args)
      .filter(
        (row) => !Number(row.is_draft) && Number(row.has_user_message) && !row.inbox_ask,
      )
      .map((row) => ({
        row,
        inFlight: this.isRunning(String(row.id), running.has(String(row.id))),
      }));
  }

  private summaryOf(
    { row, inFlight }: Found,
    projectId: string,
  ): HostSessionSummary {
    const updatedAt = Number(row.updated_at);
    return {
      projectId,
      revision: updatedAt,
      status: inFlight ? "running" : "idle",
      updatedAt,
      id: String(row.id),
      cwd: workCwd(row),
      title: String(row.title ?? ""),
      harness: String(row.harness) as RemoteProvider,
      model: row.model ? String(row.model) : undefined,
      runtimeMode: row.runtime_mode as HostSessionSummary["runtimeMode"],
      providerSessionId: row.provider_session_id
        ? String(row.provider_session_id)
        : null,
      createdAt: Number(row.created_at) || updatedAt,
      archived: !!Number(row.archived),
      pinned: !!Number(row.pinned),
      linkedWorkItem: parse(row.linked_work_item_json),
      needsInput: false,
      origin: "desktop",
    };
  }

  /** Newest copy of each session across all desktop databases. */
  private collect(where: string, args: string[], blocks = true): Found[] {
    const best = new Map<string, Found>();
    for (const path of this.paths()) {
      for (const found of this.query(path, (db) => this.rows(db, where, args, blocks)) ?? []) {
        const id = String(found.row.id);
        const old = best.get(id);
        if (!old || Number(found.row.updated_at) > Number(old.row.updated_at))
          best.set(id, found);
      }
    }
    return [...best.values()];
  }

  list(
    projectCwd: string,
    projectId: string,
    providers: readonly string[],
  ): HostSessionSummary[] {
    const target = normalizeProjectPath(projectCwd, this.platform);
    // Listing is polled; transcripts are only read for an opened session.
    return this.collect("1=1", [], false)
      .filter(
        ({ row }) =>
          providers.includes(String(row.harness)) &&
          normalizeProjectPath(String(row.cwd), this.platform) === target,
      )
      .map((found) => this.summaryOf(found, projectId));
  }

  /** When the newest desktop copy last changed, without reading its
   * transcript; polled while a remote client watches the session. */
  stamp(id: string): { updatedAt: number; running: boolean } | undefined {
    let best: { updatedAt: number; running: boolean } | undefined;
    for (const path of this.paths()) {
      const found = this.query(path, (db) => {
        const row = db
          .prepare("SELECT updated_at FROM sessions WHERE id=?")
          .get(id);
        if (!row) return undefined;
        let running = false;
        try {
          running = !!db
            .prepare("SELECT 1 FROM in_flight_sessions WHERE session_id=?")
            .get(id);
        } catch {
          /* older desktop without the table */
        }
        return {
          updatedAt: Number(row.updated_at),
          running: this.isRunning(id, running),
        };
      });
      if (found && (!best || found.updatedAt > best.updatedAt)) best = found;
    }
    return best;
  }

  /** The row's project folder, for matching it to a host project. */
  projectCwd(id: string): string | undefined {
    const found = this.collect("id=?", [id])[0];
    return found ? String(found.row.cwd) : undefined;
  }

  samePath(a: string, b: string): boolean {
    return (
      normalizeProjectPath(a, this.platform) ===
      normalizeProjectPath(b, this.platform)
    );
  }

  snapshot(id: string, projectId: string): HostSession | undefined {
    const found = this.collect("id=?", [id])[0];
    if (!found) return undefined;
    const { row } = found;
    const updatedAt = Number(row.updated_at);
    const session: Session = {
      id: String(row.id),
      harness: String(row.harness) as Session["harness"],
      model: String(row.model ?? ""),
      modelSettings: (parse(row.model_settings) as Record<string, string>) ?? {},
      runtimeMode: row.runtime_mode as Session["runtimeMode"],
      title: String(row.title ?? ""),
      cwd: workCwd(row),
      blocks: (parse(row.blocks_json) as Block[]) ?? [],
      ...(row.provider_session_id
        ? { providerSessionId: String(row.provider_session_id) }
        : {}),
      ...(row.provider_account_id
        ? { providerAccountId: String(row.provider_account_id) }
        : {}),
      ...(row.branch ? { branch: String(row.branch) } : {}),
      ...(row.worktree_cwd ? { worktreeCwd: String(row.worktree_cwd) } : {}),
      ...(row.linked_work_item_json
        ? { linkedWorkItem: parse(row.linked_work_item_json) }
        : {}),
      // A turn the desktop is running shows as running to whoever watches.
      ...(found.inFlight ? { busy: true } : {}),
    };
    return {
      session,
      projectId,
      revision: updatedAt,
      status: found.inFlight ? "running" : "idle",
      createdAt: Number(row.created_at) || updatedAt,
      updatedAt,
      archived: !!Number(row.archived),
      pinned: !!Number(row.pinned),
    };
  }
}

/** Where the provider ran: the selected worktree, else the project folder. */
function workCwd(row: Row): string {
  return String(row.worktree_cwd || row.cwd);
}

function parse(value: unknown): any {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
