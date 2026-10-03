import {
  remoteRequest,
  useRemoteMachines,
} from "../../connections/model/connections";
import { HOST_UPDATE_NOTICE } from "../../connections/model/remoteCapabilities";
import type { RemoteMachine } from "../../connections/model/protocol";
import {
  effectiveProfileId,
  listTerminalProfiles,
  saveTerminalProfile,
  useTerminalProfile,
  type ShellProfiles,
} from "../../terminal/model/terminalProfiles";

import { useEffect, useState } from "react";

import { Group, Row, Select } from "./settingsControls";

/** Which shell new terminals open in, and `!commands` run in. */
export function TerminalPage() {
  const [listed, setListed] = useState<ShellProfiles | null>(null);
  const [scanning, setScanning] = useState(false);
  const chosen = useTerminalProfile();
  const scan = (refresh: boolean) => {
    setScanning(true);
    void listTerminalProfiles(refresh)
      .then(setListed)
      .catch(() => setListed({ profiles: [], defaultId: null }))
      .finally(() => setScanning(false));
  };
  useEffect(() => scan(false), []);
  const systemDefault = listed?.profiles.find(
    (profile) => profile.id === listed.defaultId,
  );
  const missing =
    !!listed && !!chosen && !listed.profiles.some((profile) => profile.id === chosen);
  const current = effectiveProfileId(listed, chosen);

  return (
    <>
      <Group
        title="Default profile"
        description="New terminals open in this shell, and `!commands` from the composer run in it. A terminal already open keeps the shell it started with."
        action={
          <button
            type="button"
            disabled={scanning}
            onClick={() => scan(true)}
            className="h-7 rounded-md px-2.5 text-[12px] text-content/60 hover:bg-content/10 hover:text-content disabled:opacity-50"
          >
            {scanning ? "Looking…" : "Look again"}
          </button>
        }
      >
        <Row
          id="terminal-default-profile"
          label="Default terminal profile"
          description={
            missing
              ? "The shell you picked is no longer installed, so the system default is used."
              : "Automatic follows the system: PowerShell on Windows, your login shell elsewhere."
          }
        >
          <Select
            label="Default terminal profile"
            value={chosen && !missing ? chosen : ""}
            options={[
              {
                value: "",
                label: systemDefault
                  ? `Automatic (${systemDefault.name})`
                  : "Automatic",
              },
              ...(listed?.profiles ?? []).map((profile) => ({
                value: profile.id,
                label: profile.name,
              })),
            ]}
            onChange={(next) => saveTerminalProfile(next || undefined)}
          />
        </Row>
      </Group>
      <Group
        title="Available shells"
        description="Found on this computer. Git Bash runs bash commands such as ls, grep and && chains on Windows. Sessions on this computer use this choice even when you type the command on another machine."
      >
        {listed === null ? (
          <Row label="Looking for shells…" />
        ) : listed.profiles.length === 0 ? (
          <Row
            label="No shells found"
            description="Install PowerShell, Git for Windows or another shell, then look again."
          />
        ) : (
          listed.profiles.map((profile) => (
            <Row key={profile.id} label={profile.name} description={profile.path}>
              {profile.id === current ? (
                <span className="text-[12px] text-content/45">Default</span>
              ) : (
                <button
                  type="button"
                  onClick={() => saveTerminalProfile(profile.id)}
                  className="h-7 rounded-md bg-content/10 px-2.5 text-[12px] text-content hover:bg-content/15"
                >
                  Set as default
                </button>
              )}
            </Row>
          ))
        )}
      </Group>
      <RemoteMachineShells />
    </>
  );
}

/** Each connected machine runs `!commands` for its sessions in its own shell. */
export function RemoteMachineShells() {
  const { machines } = useRemoteMachines();
  if (machines.length === 0) return null;
  return (
    <>
      {machines.map((machine) => (
        <RemoteMachineShell key={machine.id} machine={machine} />
      ))}
    </>
  );
}

export function RemoteMachineShell({ machine }: { machine: RemoteMachine }) {
  const [listed, setListed] = useState<ShellProfiles | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const explain = (error: unknown) => {
    const text = String(error).replace(/^Error: /, "");
    return /unsupported|unknown method|not supported/i.test(text)
      ? HOST_UPDATE_NOTICE
      : text;
  };
  useEffect(() => {
    let alive = true;
    setProblem(null);
    void remoteRequest<ShellProfiles>(machine.id, "shell.profiles").then(
      (value) => {
        if (alive) setListed(value);
      },
      (error) => {
        if (alive) setProblem(explain(error));
      },
    );
    return () => {
      alive = false;
    };
  }, [machine.id]);
  const choose = (next: string) => {
    setSaving(true);
    setProblem(null);
    void remoteRequest<ShellProfiles>(
      machine.id,
      "shell.setProfile",
      { profile: next || null },
      false,
      true,
    )
      .then(setListed, (error) => setProblem(explain(error)))
      .finally(() => setSaving(false));
  };
  const systemDefault = listed?.profiles.find(
    (profile) => profile.id === listed.defaultId,
  );
  const chosen =
    listed?.chosenId &&
    listed.profiles.some((profile) => profile.id === listed.chosenId)
      ? listed.chosenId
      : "";
  return (
    <Group
      title={machine.name}
      description="`!commands` in sessions on this machine run here, in this shell, whichever computer you type them on."
    >
      <Row
        label="Default shell"
        description={
          problem ??
          (listed
            ? (listed.profiles.find((profile) => profile.id === (chosen || listed.defaultId))
                ?.path ?? undefined)
            : "Asking the machine…")
        }
      >
        {listed ? (
          <Select
            label={`Default shell on ${machine.name}`}
            value={chosen}
            options={[
              {
                value: "",
                label: systemDefault
                  ? `Automatic (${systemDefault.name})`
                  : "Automatic",
              },
              ...listed.profiles.map((profile) => ({
                value: profile.id,
                label: profile.name,
              })),
            ]}
            onChange={(next) => {
              if (!saving) choose(next);
            }}
          />
        ) : null}
      </Row>
    </Group>
  );
}