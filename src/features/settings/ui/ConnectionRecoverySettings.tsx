import { useSyncExternalStore } from "react";

import {
  loadRemoteAutoReconnect,
  saveRemoteAutoReconnect,
  subscribeRemoteAutoReconnect,
} from "../model/settings";

import { Group, Row, Toggle } from "./settingsControls";

export function RemoteReconnectGroup() {
  const on = useSyncExternalStore(
    subscribeRemoteAutoReconnect,
    loadRemoteAutoReconnect,
    () => true,
  );
  return (
    <div className="pt-8">
      <Group title="Connection recovery">
        <Row
          id="remote-auto-reconnect"
          label="Automatically reconnect to remote machines"
          description="Retry a machine that stopped answering, in the background and when this window regains focus or the network returns. Turn it off to reconnect only with Reconnect, when you send a message, or when you open a remote project."
        >
          <Toggle
            label="Automatically reconnect to remote machines"
            on={on}
            onChange={saveRemoteAutoReconnect}
          />
        </Row>
      </Group>
    </div>
  );
}