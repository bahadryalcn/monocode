import { expect, it } from "vitest";
import {
  isLocalSyncMachine,
  LOCAL_SYNC_MACHINE_NAME,
  remoteProjectMachines,
} from "./localSync";
import type { RemoteMachine } from "./protocol";

const local: RemoteMachine = {
  id: "l",
  name: LOCAL_SYNC_MACHINE_NAME,
  endpoint: "http://127.0.0.1:4567",
  environmentId: "env-l",
};
const ssh: RemoteMachine = {
  id: "s",
  name: "Home server",
  endpoint: "http://127.0.0.1:5000",
  environmentId: "env-s",
  ssh: { target: "me@home", remotePort: 3774 },
};

it("recognizes only the auto-linked loopback machine", () => {
  expect(isLocalSyncMachine(local)).toBe(true);
  expect(isLocalSyncMachine({ ...local, endpoint: "http://localhost:1" })).toBe(true);
  expect(isLocalSyncMachine({ ...local, name: "Mine" })).toBe(false);
  expect(isLocalSyncMachine({ ...local, endpoint: "http://10.0.0.5:1" })).toBe(false);
  expect(isLocalSyncMachine({ ...local, endpoint: "https://127.0.0.1:1" })).toBe(false);
  expect(isLocalSyncMachine({ ...local, endpoint: "not a url" })).toBe(false);
  expect(isLocalSyncMachine({ ...local, ssh: ssh.ssh })).toBe(false);
});

it("keeps the local sync machine out of the remote project picker", () => {
  expect(remoteProjectMachines([local, ssh])).toEqual([ssh]);
});
