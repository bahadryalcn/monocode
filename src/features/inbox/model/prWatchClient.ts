import { remoteRequest } from "../../connections/model/connections";
import { HOST_PR_WATCHES, type PrWatch, type PrWatchInput } from "./prWatches";
import { featureHost } from "../../connections/model/hostFeatureClient";

async function target(cwd: string) {
  const { machine, projectId } = await featureHost(cwd, HOST_PR_WATCHES);
  return { machine, project: { id: projectId } };
}
export async function listPrWatches(cwd: string): Promise<PrWatch[]> {
  const { machine, project } = await target(cwd);
  return remoteRequest<PrWatch[]>(machine.id, "delivery.pr.list", { projectId: project.id });
}
export async function linkPrWatch(cwd: string, input: Omit<PrWatchInput, "projectId">): Promise<PrWatch> {
  const { machine, project } = await target(cwd);
  return remoteRequest<PrWatch>(machine.id, "delivery.pr.link", { input: { ...input, projectId: project.id } }, false, true);
}
export async function updatePrWatch(cwd: string, id: string, action: "remove" | "resume" | "pause" | "check"): Promise<void> {
  const { machine, project } = await target(cwd);
  await remoteRequest(machine.id, `delivery.pr.${action}`, { id, projectId: project.id }, false, true);
}
