import { useEffect, useState } from "react";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { EyeOff, Lock } from "../../../shared/ui/icons";
import { useGroupLock } from "../hooks/useGroupLock";
import {
  authorizeHiddenGroups,
  closeHiddenGroups,
  hideGroup,
  restoreHiddenGroup,
} from "../model/groupLock";
import type { GroupLockControls } from "./GroupLockSettings";
import { PasswordPromptDialog } from "./PasswordPromptDialog";

export function HiddenGroupsSettings({
  controls: { Group, Row },
}: {
  controls: Pick<GroupLockControls, "Group" | "Row">;
}) {
  const privacy = useGroupLock();
  const [prompt, setPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => closeHiddenGroups, []);
  const authorized = !privacy.hasPassword || privacy.hiddenGroupsAuthorized;
  const groups = authorized
    ? privacy.groups.filter((group) =>
        privacy.savedHiddenGroupIds.has(group.id),
      )
    : [];
  const restore = (id: string, temporary: boolean) => {
    setError(
      restoreHiddenGroup(id, temporary)
        ? null
        : "Could not save visibility. Please try again.",
    );
  };
  return (
    <Group
      id="hidden-project-groups"
      title={
        <span className="privacy-heading">
          <EyeOff aria-hidden className="size-4" />
          Hidden groups
        </span>
      }
      description="Keep personal projects out of view. Restore them here at any time."
    >
      {!authorized ? (
        <Row
          label={
            <span className="privacy-gate-label">
              <Lock aria-hidden className="size-4" />
              Group names are concealed
            </span>
          }
          description="Enter your password to view and restore hidden groups."
        >
          <SecondaryButton onClick={() => setPrompt(true)}>
            Manage hidden groups…
          </SecondaryButton>
        </Row>
      ) : groups.length === 0 ? (
        <Row
          label="No hidden groups"
          description="Right-click a project group and choose Hide group to hide it on this device."
        />
      ) : (
        groups.map((group) => (
          <Row
            key={group.id}
            label={group.name}
            description={
              privacy.hiddenGroupIds.has(group.id)
                ? "Hidden on this device"
                : "Visible until restart or Lock all groups"
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {privacy.hiddenGroupIds.has(group.id) ? (
                <SecondaryButton onClick={() => restore(group.id, true)}>
                  Show temporarily
                </SecondaryButton>
              ) : (
                <SecondaryButton
                  onClick={() =>
                    setError(
                      hideGroup(group.id)
                        ? null
                        : "Could not save visibility. Please try again.",
                    )
                  }
                >
                  Hide again
                </SecondaryButton>
              )}
              <SecondaryButton onClick={() => restore(group.id, false)}>
                Make visible
              </SecondaryButton>
            </div>
          </Row>
        ))
      )}
      {authorized && privacy.hasPassword ? (
        <div className="privacy-hidden-footer">
          <SecondaryButton onClick={closeHiddenGroups}>
            Conceal group names
          </SecondaryButton>
        </div>
      ) : null}
      {authorized && groups.length > 0 ? (
        <p className="privacy-inline-note">
          Temporary visibility ends on restart. Make visible restores the group
          permanently.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {prompt ? (
        <PasswordPromptDialog
          title="Manage hidden groups"
          description="Enter your lock password to view hidden group names."
          submitLabel="Continue"
          verify={authorizeHiddenGroups}
          onDone={() => setPrompt(false)}
          onClose={() => setPrompt(false)}
        />
      ) : null}
    </Group>
  );
}
