import { unlockGroup } from "../model/groupLock";
import { PasswordPromptDialog } from "./PasswordPromptDialog";

type Props = {
  groupId: string;
  name: string;
  onClose: () => void;
};

/** Opens a locked group. A correct password unlocks and expands it. */
export function UnlockGroupDialog({ groupId, name, onClose }: Props) {
  return (
    <PasswordPromptDialog
      title={`Unlock ${name}`}
      description="Enter the lock password to open this group."
      submitLabel="Unlock"
      verify={(password) => unlockGroup(groupId, password)}
      onDone={onClose}
      onClose={onClose}
    />
  );
}
