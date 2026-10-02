import { useState, type ReactNode } from "react";
import { Lock, LockOpen } from "../../../shared/ui/icons";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { useGroupLock } from "../hooks/useGroupLock";
import {
  AUTO_LOCK_MINUTES,
  autoLockLabel,
  parseAutoLockMinutes,
} from "../model/autoLock";
import {
  lockAllGroups,
  makeGroupLockable,
  removeGroupLock,
  removeLockPassword,
  setAutoLockMinutes,
  setRelockOnLaunch,
  setUnlockAll,
} from "../model/groupLock";
import { ForgotLockPasswordDialog } from "./ForgotLockPasswordDialog";
import { PasswordPromptDialog } from "./PasswordPromptDialog";
import { SetLockPasswordDialog } from "./SetLockPasswordDialog";

/** The Settings building blocks, passed in so this page matches the others. */
export type GroupLockControls = {
  Group: (props: {
    id?: string;
    title: ReactNode;
    description?: string;
    children: ReactNode;
  }) => ReactNode;
  Row: (props: {
    id?: string;
    label: ReactNode;
    description?: string;
    children?: ReactNode;
  }) => ReactNode;
  Toggle: (props: {
    label: string;
    on: boolean;
    onChange: (on: boolean) => void;
    disabled?: boolean;
  }) => ReactNode;
  Select: (props: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => ReactNode;
};

type Dialog =
  | { kind: "set"; thenLockable?: string }
  | { kind: "change" }
  | { kind: "remove" }
  | { kind: "forgot" }
  | { kind: "remove-lock"; id: string; name: string };

/** Settings page for the group lock: the password, its options, and which groups use it. */
export function GroupLockSettings({
  controls: { Group, Row, Toggle, Select },
}: {
  controls: GroupLockControls;
}) {
  const lock = useGroupLock();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const hasLockable = lock.groups.some((group) => group.lockable);

  const toggleLockable = (id: string, name: string, on: boolean) => {
    if (!on) setDialog({ kind: "remove-lock", id, name });
    else if (!lock.hasPassword) setDialog({ kind: "set", thenLockable: id });
    else makeGroupLockable(id);
  };

  return (
    <>
      <Group
        id="group-lock-password"
        title="Lock password"
        description="One password locks any number of groups, so there is only one to remember. It hides locked groups inside MonoCode. It does not encrypt project files, the session database, or the Claude Code and Codex transcripts on disk."
      >
        {lock.hasPassword ? (
          <>
            <Row
              label="Password"
              description="Needed to open a locked group, change the password, or take a lock off."
            >
              <SecondaryButton onClick={() => setDialog({ kind: "change" })}>
                Change password…
              </SecondaryButton>
              <SecondaryButton
                danger
                onClick={() => setDialog({ kind: "remove" })}
              >
                Remove password…
              </SecondaryButton>
            </Row>
            <Row
              label="Forgot the password?"
              description="A forgotten password cannot be recovered. Resetting removes it and every group lock; projects stay in their groups."
            >
              <SecondaryButton
                danger
                onClick={() => setDialog({ kind: "forgot" })}
              >
                Forgot password…
              </SecondaryButton>
            </Row>
          </>
        ) : (
          <Row
            label="No password set"
            description="Set a password, then choose which groups to lock. You can also lock a group straight from the project rail."
          >
            <SecondaryButton onClick={() => setDialog({ kind: "set" })}>
              Set lock password…
            </SecondaryButton>
          </Row>
        )}
      </Group>

      <div className="pt-8">
        <Group id="group-lock-options" title="Options">
          <Row
            label="Lock groups again when MonoCode starts"
            description="Off keeps groups open across restarts until you lock them."
          >
            <Toggle
              label="Lock groups again when MonoCode starts"
              on={lock.settings.relockOnLaunch}
              onChange={setRelockOnLaunch}
            />
          </Row>
          <Row
            label="Auto-lock after inactivity"
            description="Locks every group when MonoCode sees no keyboard or mouse input for this long."
          >
            <Select
              label="Auto-lock after inactivity"
              value={String(lock.settings.autoLockMinutes)}
              options={AUTO_LOCK_MINUTES.map((minutes) => ({
                value: String(minutes),
                label: autoLockLabel(minutes),
              }))}
              onChange={(value) =>
                setAutoLockMinutes(parseAutoLockMinutes(Number(value)))
              }
            />
          </Row>
          <Row
            label="Unlocking one group unlocks all"
            description="Off asks for the password again for each locked group."
          >
            <Toggle
              label="Unlocking one group unlocks all"
              on={lock.settings.unlockAll}
              onChange={setUnlockAll}
            />
          </Row>
          <Row
            label="Lock all groups now"
            description="Closes every group and asks for the password to open them again."
          >
            <SecondaryButton disabled={!hasLockable} onClick={lockAllGroups}>
              Lock all groups
            </SecondaryButton>
          </Row>
        </Group>
      </div>

      <div className="pt-8">
        <Group
          id="group-lock-groups"
          title="Groups"
          description="Locked groups show only their name in the rail. Their projects, sessions, search results and notifications stay hidden until you unlock them."
        >
          {lock.groups.length === 0 ? (
            <Row
              label="No groups yet"
              description="Create a project group in the rail, then lock it here or from its header."
            />
          ) : (
            lock.groups.map((group) => {
              const locked = lock.lock.lockedGroupIds.has(group.id);
              return (
                <Row
                  key={group.id}
                  label={
                    <span className="flex items-center gap-2">
                      {locked ? (
                        <Lock
                          className="size-3.5 text-content/55"
                          strokeWidth={1.75}
                        />
                      ) : group.lockable ? (
                        <LockOpen
                          className="size-3.5 text-content/55"
                          strokeWidth={1.75}
                        />
                      ) : null}
                      <span className="truncate">{group.name}</span>
                    </span>
                  }
                  description={
                    locked
                      ? "Locked"
                      : group.lockable
                        ? "Lockable, currently unlocked"
                        : undefined
                  }
                >
                  <Toggle
                    label={`${group.name} is lockable`}
                    on={group.lockable === true}
                    onChange={(on) => toggleLockable(group.id, group.name, on)}
                  />
                </Row>
              );
            })
          )}
        </Group>
      </div>

      {dialog?.kind === "set" ? (
        <SetLockPasswordDialog
          mode="set"
          onClose={close}
          onDone={() => {
            if (dialog.thenLockable) makeGroupLockable(dialog.thenLockable);
          }}
        />
      ) : null}
      {dialog?.kind === "change" ? (
        <SetLockPasswordDialog mode="change" onClose={close} />
      ) : null}
      {dialog?.kind === "remove" ? (
        <PasswordPromptDialog
          title="Remove lock password"
          description="Removes the password and every group lock."
          submitLabel="Remove password"
          danger
          verify={removeLockPassword}
          onDone={close}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "forgot" ? (
        <ForgotLockPasswordDialog onClose={close} />
      ) : null}
      {dialog?.kind === "remove-lock" ? (
        <PasswordPromptDialog
          title={`Remove lock from ${dialog.name}`}
          description="The group stays; it just stops asking for the password."
          submitLabel="Remove lock"
          danger
          verify={(password) => removeGroupLock(dialog.id, password)}
          onDone={close}
          onClose={close}
        />
      ) : null}
    </>
  );
}
