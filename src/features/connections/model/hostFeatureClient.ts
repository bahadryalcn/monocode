import { invoke } from "@tauri-apps/api/core";
import { backgroundMachineFor, hostProjectFor } from "../../automations/model/hostAutomationClient";
import { machineCapabilities } from "../../automations/model/machineSnapshot";
import { remoteRequest } from "./connections";
import { parseRemotePath } from "./remoteProjects";
import type { RemoteMachine } from "./protocol";

/** Resolve only the owning machine. Missing remote access must never fall back locally. */
export async function featureHost(cwd: string, capability: string) {
  if (!cwd.trim()) throw new Error("Choose a project before opening host tools.");
  let machines = await invoke<RemoteMachine[]>("remote_machines");
  let machine = backgroundMachineFor(machines, cwd);
  if (!machine && !parseRemotePath(cwd)) {
    const local = await invoke<RemoteMachine | null>("local_host_connect");
    if (local) machine = local;
  }
  if (!machine) throw new Error("This project's machine is not connected.");
  const capabilities = await machineCapabilities(machine);
  if (!capabilities.includes(capability))
    throw new Error("Update İmece Host on this project's machine to use this feature.");
  const project = await hostProjectFor(machine, cwd);
  return { machine, projectId: project.id };
}

export async function hostFeatureRequest<T>(
  cwd: string,
  capability: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { machine, projectId } = await featureHost(cwd, capability);
  return remoteRequest<T>(machine.id, method, { ...params, projectId });
}
