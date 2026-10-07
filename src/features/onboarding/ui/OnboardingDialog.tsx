import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "../../../shared/ui/Modal";
import { PRODUCT_IDENTITY } from "../../../shared/lib/productIdentity";
import { ConnectionsSettings } from "../../connections/ui/ConnectionsSettings";
import { AddRemoteProjectDialog } from "../../connections/ui/AddRemoteProjectDialog";
import { useRemoteMachines } from "../../connections/model/connections";
import { remoteProjectMachines } from "../../connections/model/localSync";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";
import { HARNESS_TITLE, type HarnessId } from "../../sessions/model/session";
import { ProviderSignInDialog } from "../../sessions/ui/ProviderSignInDialog";
import { ProviderBinaryControl } from "../../settings/ui/ProviderBinarySettings";
import {
  getHarnessAvailabilitySnapshot,
  subscribeHarnessAvailability,
  isHarnessAvailable,
  probeHarnessAvailability,
} from "../../../integrations/harness/core/availability";
import {
  discoverImportableSessions,
  type ImportCandidate,
} from "../../../platform/tauri/sessionImport";
import { importedSessionKeys } from "../../sessions/data/sessionStore";
import {
  groupByFolder,
  isAlreadyImported,
} from "../../sessions/import/importModel";
import {
  isUsableProjectFolder,
  runSessionImport,
  type ImportProgress,
  type ImportSummary,
} from "../../sessions/import/importRunner";
import { pickFolders } from "../../../platform/tauri/fs";
import { rememberProject } from "../../projects/model/recents";
import { projectName } from "../../../shared/lib/paths";
import "./onboarding.css";

const STEPS = ["Connect", "Agents", "Projects"];
const INSTALL_GUIDES = {
  codex: "https://help.openai.com/en/articles/11096431",
  claude:
    "https://support.claude.com/en/articles/14552382-your-first-day-in-claude-code",
  gemini: "https://geminicli.com/docs/get-started/installation/",
};

type Props = {
  onFinish: () => void;
  onImported: () => void;
  onOpenProject: (path: string) => void;
};

export default function OnboardingDialog({
  onFinish,
  onImported,
  onOpenProject,
}: Props) {
  const [step, setStep] = useState(0);
  const [connections, setConnections] = useState(false);
  const [remotePicker, setRemotePicker] = useState(false);
  const [signIn, setSignIn] = useState<HarnessId | null>(null);
  const [signedIn, setSignedIn] = useState<ReadonlySet<HarnessId>>(new Set());
  const [busy, setBusy] = useState(false);
  const { machines } = useRemoteMachines();
  const remotes = remoteProjectMachines(machines);

  return (
    <Modal
      title={`Welcome to ${PRODUCT_IDENTITY.displayName}`}
      size="lg"
      minimalHeader
      className="onboarding-panel"
      onClose={busy ? () => undefined : onFinish}
    >
      <div className="onboarding-header">
        <div className="onboarding-brand">
          <img src={PRODUCT_IDENTITY.logoSrc} alt="" />
          {PRODUCT_IDENTITY.displayName}
        </div>
        <ol className="onboarding-steps" aria-label="Getting started">
          {STEPS.map((label, index) => (
            <li key={label} aria-current={index === step ? "step" : undefined}>
              <button
                disabled={busy || index > step}
                onClick={() => setStep(index)}
              >
                <span
                  className={
                    index < step
                      ? "onboarding-number complete"
                      : "onboarding-number"
                  }
                >
                  {index < step ? "✓" : index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="onboarding-body">
        {step === 0 ? (
          <>
            <h3>Connect your computers</h3>
            <p>
              Start on this computer, or connect another computer to work on its
              projects.
            </p>
            <div className="onboarding-card">
              <span aria-hidden="true">▣</span>
              <div>
                <strong>This computer</strong>
                <small>Your local projects and agents</small>
              </div>
              <span className="onboarding-status">✓ Connected</span>
            </div>
            {remotes.map((machine) => (
              <div className="onboarding-card" key={machine.id}>
                <span aria-hidden="true">▣</span>
                <div>
                  <strong>{machine.name}</strong>
                  <small>Remote computer</small>
                </div>
              </div>
            ))}
            <button
              className="onboarding-link"
              aria-expanded={connections}
              onClick={() => setConnections(!connections)}
            >
              Manage computers <span>{connections ? "−" : "+"}</span>
            </button>
            {connections ? (
              <div className="onboarding-settings">
                <ConnectionsSettings />
              </div>
            ) : null}
            <footer>
              <button className="onboarding-muted" onClick={onFinish}>
                Set up later
              </button>
              <button className="onboarding-primary" onClick={() => setStep(1)}>
                Continue →
              </button>
            </footer>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <h3>Connect your agents</h3>
            <p>
              Set up an agent on this computer. You can add more in Settings
              later.
            </p>
            <Agents onSignIn={setSignIn} signedIn={signedIn} />
            {remotes.length ? (
              <p>Agents on remote computers are configured on each computer.</p>
            ) : null}
            <footer>
              <button className="onboarding-muted" onClick={() => setStep(0)}>
                ← Back
              </button>
              <button className="onboarding-primary" onClick={() => setStep(2)}>
                Continue →
              </button>
            </footer>
          </>
        ) : null}
        {step === 2 ? (
          <Projects
            onBusy={setBusy}
            onImported={onImported}
            onFinish={onFinish}
            onBack={() => setStep(1)}
            onOpenRemote={
              remotes.length ? () => setRemotePicker(true) : undefined
            }
          />
        ) : null}
      </div>
      {signIn ? (
        <ProviderSignInDialog
          harness={signIn}
          onClose={() => setSignIn(null)}
          completeDescription="Your agent is connected. Continue setting up your projects."
          onSignedIn={() =>
            setSignedIn((current) => new Set([...current, signIn]))
          }
        />
      ) : null}
      {remotePicker ? (
        <AddRemoteProjectDialog
          onCancel={() => setRemotePicker(false)}
          onOpen={(path) => {
            onImported();
            onOpenProject(path);
            setRemotePicker(false);
          }}
        />
      ) : null}
    </Modal>
  );
}

function Agents({
  onSignIn,
  signedIn,
}: {
  onSignIn: (harness: HarnessId) => void;
  signedIn: ReadonlySet<HarnessId>;
}) {
  useSyncExternalStore(
    subscribeHarnessAvailability,
    getHarnessAvailabilitySnapshot,
    getHarnessAvailabilitySnapshot,
  );
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const refresh = () => {
    setChecking(true);
    setError("");
    void probeHarnessAvailability({ force: true })
      .catch((reason) => {
        if (alive.current) setError(String(reason));
      })
      .finally(() => {
        if (alive.current) setChecking(false);
      });
  };
  useEffect(() => {
    alive.current = true;
    refresh();
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <>
      {(["codex", "claude", "gemini"] as const).map((provider) => (
        <div className="onboarding-card" key={provider}>
          <HarnessIcon harness={provider} className="size-5 shrink-0" />
          <div>
            <strong>{HARNESS_TITLE[provider]}</strong>
            <small>
              {checking
                ? "Checking installation…"
                : signedIn.has(provider)
                  ? "✓ Signed in"
                  : isHarnessAvailable(provider)
                    ? "CLI installed · sign in with your provider account"
                    : "Install the CLI, then refresh to continue"}
            </small>
          </div>
          <ProviderBinaryControl provider={provider} />
          {!checking && !isHarnessAvailable(provider) ? (
            <button
              className="onboarding-small"
              onClick={() =>
                void openUrl(INSTALL_GUIDES[provider]).catch((reason) =>
                  setError(String(reason)),
                )
              }
            >
              Install guide ↗
            </button>
          ) : (
            <button
              className="onboarding-small"
              disabled={checking}
              onClick={() => onSignIn(provider)}
            >
              Sign in
            </button>
          )}
        </div>
      ))}
      <button
        className="onboarding-muted"
        disabled={checking}
        onClick={refresh}
      >
        Refresh agent status
      </button>
      <p>
        Already signed in through the CLI? Your existing account is used
        automatically.
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}

function Projects({
  onBusy,
  onImported,
  onFinish,
  onBack,
  onOpenRemote,
}: {
  onBusy: (busy: boolean) => void;
  onImported: () => void;
  onFinish: () => void;
  onBack: () => void;
  onOpenRemote?: () => void;
}) {
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addedFolders, setAddedFolders] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const running = useRef(false);
  const folders = groupByFolder(candidates);

  useEffect(() => {
    let alive = true;
    Promise.all([discoverImportableSessions(), importedSessionKeys()])
      .then(([report, keys]) => {
        if (!alive) return;
        const stored = new Set(keys);
        const next = report.candidates.filter(
          (item) =>
            item.kind === "interactive" &&
            isUsableProjectFolder(item) &&
            !isAlreadyImported(item, stored),
        );
        setCandidates(next);
        setSelected(new Set(groupByFolder(next).map((folder) => folder.key)));
      })
      .catch((reason) => {
        if (alive) setError(String(reason));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);

  const start = async () => {
    if (running.current) return;
    running.current = true;
    setImporting(true);
    onBusy(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await runSessionImport({
        candidates: folders
          .filter((folder) => selected.has(folder.key))
          .flatMap((folder) => folder.items),
        groupProjects: true,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setSummary(result);
    } catch (reason) {
      setError(String(reason));
    } finally {
      running.current = false;
      setImporting(false);
      setProgress(null);
      onBusy(false);
      onImported();
    }
  };
  const addFolders = async () => {
    setAdding(true);
    onBusy(true);
    try {
      const paths = await pickFolders();
      for (const path of paths) rememberProject(path);
      setAddedFolders((current) => [...new Set([...current, ...paths])]);
      onImported();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setAdding(false);
      onBusy(false);
    }
  };
  const busy = importing || adding;
  return (
    <>
      <h3>Choose your projects</h3>
      <p>
        Import local projects and conversations from Claude Code and Codex, or
        choose a folder.
      </p>
      {error ? (
        <p className="onboarding-error" role="alert">
          Could not complete this action: {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Scanning this computer’s conversation history…</p>
      ) : null}
      {!loading && !summary ? (
        <>
          <div className="onboarding-selection">
            <span>
              {selected.size} of {folders.length} selected
            </span>
            <div>
              <button
                disabled={busy}
                onClick={() =>
                  setSelected(new Set(folders.map((folder) => folder.key)))
                }
              >
                Select all
              </button>
              <button disabled={busy} onClick={() => setSelected(new Set())}>
                Select none
              </button>
            </div>
          </div>
          <div className="onboarding-projects">
            {folders.map((folder) => (
              <label className="onboarding-project" key={folder.key}>
                <input
                  type="checkbox"
                  checked={selected.has(folder.key)}
                  disabled={busy}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(folder.key);
                      else next.delete(folder.key);
                      return next;
                    });
                  }}
                />
                <div>
                  <strong>{projectName(folder.path)}</strong>
                  <small title={folder.path}>{folder.path}</small>
                </div>
                <span className="onboarding-provider-icons">
                  {[...new Set(folder.items.map((item) => item.provider))].map(
                    (provider) => (
                      <HarnessIcon
                        key={provider}
                        harness={provider}
                        className="size-3.5"
                      />
                    ),
                  )}
                </span>
                <span title="Conversations">{folder.items.length}</span>
              </label>
            ))}
            {!folders.length ? (
              <p>
                No new conversation history found. Choose a project folder to
                start.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      {importing ? (
        <div role="status" aria-live="polite">
          <p>
            Importing conversations: {progress?.done ?? 0} /{" "}
            {progress?.total ?? 0}
          </p>
          <button
            className="onboarding-muted"
            onClick={() => abort.current?.abort()}
          >
            Cancel import
          </button>
        </div>
      ) : null}
      {summary ? (
        <div role="status">
          <p>
            {summary.imported} conversations imported across {summary.projects}{" "}
            projects.{summary.cancelled ? " Import cancelled." : ""}
          </p>
          {summary.failed.length ? (
            <div role="alert">
              <p>
                {summary.failed.length} conversations could not be imported.
              </p>
              {summary.failed.map((failure, index) => (
                <p key={index}>
                  {failure.candidate.cwd}: {failure.error}
                </p>
              ))}
            </div>
          ) : null}
          {summary.readOnly || summary.truncated ? (
            <p>
              {summary.readOnly} history-only conversations ·{" "}
              {summary.truncated} shortened transcripts
            </p>
          ) : null}
        </div>
      ) : null}
      {addedFolders.length ? (
        <div role="status">
          <p>{addedFolders.length} project folders added.</p>
          {addedFolders.map((path) => (
            <div className="onboarding-project" key={path}>
              <span>✓</span>
              <div>
                <strong>{projectName(path)}</strong>
                <small>{path}</small>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="onboarding-project-actions">
        <button
          className="onboarding-muted"
          disabled={busy}
          onClick={() => void addFolders()}
        >
          + Choose project folders
        </button>
        {onOpenRemote ? (
          <button
            className="onboarding-muted"
            disabled={busy}
            onClick={onOpenRemote}
          >
            + Open a remote project
          </button>
        ) : null}
      </div>
      <footer>
        <button className="onboarding-muted" disabled={busy} onClick={onBack}>
          ← Back
        </button>
        <div className="onboarding-footer-actions">
          {!summary ? (
            <button
              className="onboarding-muted"
              disabled={busy}
              onClick={onFinish}
            >
              Do not import projects
            </button>
          ) : null}
          <button
            className="onboarding-primary"
            disabled={busy || (!summary && loading && selected.size > 0)}
            onClick={summary || !selected.size ? onFinish : () => void start()}
          >
            {summary || !selected.size
              ? "Start coding →"
              : `Import ${selected.size} projects`}
          </button>
        </div>
      </footer>
    </>
  );
}
