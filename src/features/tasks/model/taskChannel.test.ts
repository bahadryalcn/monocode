import { afterEach, expect, it, vi } from "vitest";
import { remoteRequest } from "../../connections/model/connections";
import {
  subscribeRemoteMachineChannel,
  type MachineChannelListener,
} from "../../connections/model/remoteMachineChannel";
import { listBoardTaskResults, subscribeBoardTaskChanges } from "./taskClient";
import type { RemoteMachine } from "../../connections/model/protocol";
vi.mock("../../connections/model/connections", () => ({
  remoteRequest: vi.fn(),
}));
vi.mock("../../connections/model/remoteMachineChannel", () => ({
  subscribeRemoteMachineChannel: vi.fn(),
}));
vi.mock("../../automations/model/machineSnapshot", () => ({
  machineCapabilities: async () => ["machine.changes"],
  machineProjects: async () => [{ id: "p", cwd: "/project", name: "project" }],
}));
afterEach(() => vi.clearAllMocks());
const machine: RemoteMachine = {
  id: "m",
  environmentId: "host",
  name: "Mac",
  endpoint: "https://host",
};
it("reads task lists only after shared metadata invalidations and releases the subscriber", async () => {
  let receive!: MachineChannelListener;
  let receiveError!: (error: unknown) => void;
  const released = vi.fn();
  vi.mocked(subscribeRemoteMachineChannel).mockImplementation(
    (_machine, _demand, listener, onError) => {
      receive = listener;
      receiveError = onError!;
      return released;
    },
  );
  vi.mocked(remoteRequest).mockResolvedValue([]);
  const changed = vi.fn();
  const release = subscribeBoardTaskChanges([machine], changed);
  await Promise.resolve();
  try {
    await listBoardTaskResults([machine]);
    const cached = await listBoardTaskResults([machine]);
    expect(cached[0].cached).toBe(true);
    expect(remoteRequest).toHaveBeenCalledTimes(1);
    const forced = await listBoardTaskResults([machine], [], true);
    expect(forced[0].cached).toBeUndefined();
    expect(remoteRequest).toHaveBeenCalledTimes(2);
    await listBoardTaskResults([machine]);
    expect(remoteRequest).toHaveBeenCalledTimes(2);
    receiveError(new Error("control poll failed"));
    expect(changed).toHaveBeenCalledOnce();
    await listBoardTaskResults([machine]);
    expect(remoteRequest).toHaveBeenCalledTimes(3);
    receive({
      instanceId: "boot",
      reset: false,
      sessions: [],
      projects: [],
      tasks: { etag: "new" },
    });
    expect(changed).toHaveBeenCalledTimes(2);
    await listBoardTaskResults([machine]);
    expect(remoteRequest).toHaveBeenCalledTimes(4);
    receive({
      instanceId: "boot",
      reset: false,
      sessions: [],
      projects: [],
      tasks: { etag: "new" },
    });
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    release();
  }
  expect(released).toHaveBeenCalledOnce();
});
