import {
  loadProjectGroupAssignments,
  loadProjectGroups,
  reorderProjectGroups,
  saveProjectGroupAssignments,
  saveProjectGroups,
  type ProjectGroup,
} from "../../projects/model/projectGroups";
import { localPathKeyForProjectId } from "./syncProjects";
import { mergeIdOrder } from "./syncOrder";
import { knownRecordIds, loadPeerState, queueLocalChange } from "./syncPeerState";
import type { SyncAssignmentValue, SyncGroupOrderValue, SyncGroupValue, SyncRecord } from "./syncProtocol";

function seenGroupsKey(machineId: string): string {
  return `monocode.sync.seenGroups:${machineId}`;
}

function loadSeenGroups(machineId: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(seenGroupsKey(machineId)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeenGroups(machineId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(seenGroupsKey(machineId), JSON.stringify([...ids]));
  } catch {
    // ignored; re-learned on the next capture
  }
}

const GROUP_ORDER_ID = "groups";

function lastHostGroupOrder(machineId: string): string[] {
  try {
    const parsed = JSON.parse(loadPeerState(machineId).recordValues[`groupOrder:${GROUP_ORDER_ID}`] ?? "null");
    const order: unknown = parsed?.order;
    return Array.isArray(order) ? order.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function syncableGroup(group: ProjectGroup): SyncGroupValue {
  const { workspaceFile: _file, workspaceFolders: _folders, ...rest } = group;
  return rest as SyncGroupValue;
}

/** Queues every local group, and every assignment this machine can resolve
 * to a project sync id (`pathToProjectId`, from Task 7's id cache; an
 * assignment whose path has no id yet is simply skipped this cycle). */
export function captureLocalGroupChanges(
  machineId: string,
  pathToProjectId: Record<string, string> = {},
): void {
  const localGroups = loadProjectGroups();
  const seen = loadSeenGroups(machineId);
  const localIds = new Set(localGroups.map((group) => group.id));
  for (const group of localGroups) {
    queueLocalChange(machineId, "group", group.id, syncableGroup(group));
    seen.add(group.id);
  }
  for (const id of knownRecordIds(machineId, "group")) {
    if (seen.has(id) && !localIds.has(id)) queueLocalChange(machineId, "group", id, null);
  }
  saveSeenGroups(machineId, seen);
  const order: SyncGroupOrderValue = {
    order: mergeIdOrder(
      lastHostGroupOrder(machineId),
      localGroups.map((group) => group.id),
      localIds,
    ),
  };
  queueLocalChange(machineId, "groupOrder", GROUP_ORDER_ID, order);
  const assignments = loadProjectGroupAssignments();
  for (const [pathKeyValue, groupId] of Object.entries(assignments)) {
    const projectId = pathToProjectId[pathKeyValue];
    if (!projectId) continue;
    const value: SyncAssignmentValue = { projectId, groupId };
    queueLocalChange(machineId, "assignment", projectId, value);
  }
  const assignedProjectIds = new Set(
    Object.keys(assignments)
      .map((pathKeyValue) => pathToProjectId[pathKeyValue])
      .filter(Boolean),
  );
  for (const projectId of Object.values(pathToProjectId)) {
    if (assignedProjectIds.has(projectId)) continue;
    queueLocalChange(machineId, "assignment", projectId, null);
  }
}

/** Applies incoming group and assignment records. A group tombstone
 * removes the group (its assignment, if any, is cleared the same way
 * `deleteProjectGroup` does locally). An assignment's sync id is always
 * the projectId it is for (see `captureLocalGroupChanges`); it is applied
 * through `localPathKeyForProjectId`, and skipped when this machine has no
 * local path for that projectId yet — Task 7 fills that mapping in once
 * this machine opens the matching folder, and a later cycle re-applies it. */
export function applyRemoteGroupRecords(machineId: string, records: readonly SyncRecord[]): void {
  const groupRecords = records.filter((record) => record.table === "group");
  if (groupRecords.length > 0) {
    let groups = loadProjectGroups();
    const seen = loadSeenGroups(machineId);
    for (const record of groupRecords) {
      const value = record.value as SyncGroupValue | null;
      const index = groups.findIndex((group) => group.id === record.id);
      if (!value) {
        if (index >= 0) groups = groups.filter((_, i) => i !== index);
      } else if (index >= 0) {
        const { workspaceFile, workspaceFolders } = groups[index];
        const merged = {
          ...syncableGroup(value as ProjectGroup),
          ...(workspaceFile ? { workspaceFile, workspaceFolders } : {}),
        } as ProjectGroup;
        groups = groups.map((group, i) => (i === index ? merged : group));
        seen.add(record.id);
      } else {
        groups = [...groups, syncableGroup(value as ProjectGroup) as ProjectGroup];
        seen.add(record.id);
      }
    }
    saveProjectGroups(groups);
    saveSeenGroups(machineId, seen);
    saveProjectGroupAssignments(loadProjectGroupAssignments(loadProjectGroups()));
  }
  const orderValue = records.find((record) => record.table === "groupOrder")?.value as SyncGroupOrderValue | null | undefined;
  if (orderValue && Array.isArray(orderValue.order)) {
    const localIds = loadProjectGroups().map((group) => group.id);
    const local = new Set(localIds);
    const remote = orderValue.order.filter((id, i) => local.has(id) && orderValue.order.indexOf(id) === i);
    const included = new Set(remote);
    reorderProjectGroups([...remote, ...localIds.filter((id) => !included.has(id))]);
  }
  const assignmentRecords = records.filter((record) => record.table === "assignment");
  if (assignmentRecords.length === 0) return;
  const assignments = loadProjectGroupAssignments();
  for (const record of assignmentRecords) {
    const pathKeyValue = localPathKeyForProjectId(record.id);
    if (!pathKeyValue) continue;
    const value = record.value as SyncAssignmentValue | null;
    if (value?.groupId) assignments[pathKeyValue] = value.groupId;
    else delete assignments[pathKeyValue];
  }
  saveProjectGroupAssignments(assignments);
}
