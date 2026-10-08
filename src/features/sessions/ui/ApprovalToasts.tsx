import { t, useLocale } from "../../../shared/i18n";
import { CircleAlert } from "../../../shared/ui/icons";
import { useState } from "react";
import { createPortal } from "react-dom";
import { allowsProjectNotification } from "../../notifications/model/notificationPreferences";
import { knownNotificationProject } from "../../notifications/model/notificationProjects";
import { useProjectNotificationPreferences } from "../../notifications/hooks/useProjectNotificationPreferences";
import { useLockSnapshot } from "../../group-lock/hooks/useGroupLock";
import { isProjectLockedIn } from "../../group-lock/model/lockState";
import { LOCKED_NOTIFICATION_TEXT } from "../../notifications/model/attention";
import type { ApprovalDecision } from "../../../integrations/harness";
import type { PendingApprovalNotice } from "../../notifications/model/approvalToast";
import { LAYER } from "../../../shared/lib/layers";
import {
  HARNESS_TITLE,
  sessionDisplayTitle,
  type Session,
} from "../model/session";
import { HarnessIcon } from "./HarnessIcon";

type Notice = PendingApprovalNotice & { session: Session };

type Props = {
  notices: Notice[];
  topOffset?: number;
  onFocusSession: (sessionId: string) => void;
  onApproval: (
    sessionId: string,
    requestId: number,
    decision: ApprovalDecision,
  ) => void;
};

export function ApprovalToasts({
  notices,
  onFocusSession,
  onApproval,
  topOffset = 12,
}: Props) {
  useLocale();
  useProjectNotificationPreferences();
  const lock = useLockSnapshot();
  if (notices.length === 0) return null;
  // A request from a locked group shows no names, command or buttons, and is
  // one card however many there are.
  const open = notices.filter(
    (notice) => !isProjectLockedIn(lock, notice.session.cwd),
  );
  const hasLocked = open.length < notices.length;

  return createPortal(
    <div
      aria-live="polite"
      style={{ zIndex: LAYER.toast, top: topOffset }}
      className="pointer-events-none fixed right-3 flex w-[min(360px,calc(100vw-24px))] flex-col gap-2"
    >
      {open.map((notice) => (
        <ProjectApprovalToast
          key={`${notice.sessionId}:${notice.kind}:${notice.requestId}`}
          notice={notice}
          onFocusSession={onFocusSession}
          onApproval={onApproval}
        />
      ))}
      {hasLocked ? (
        <article
          className="approval-toast pointer-events-auto flex items-center gap-2 rounded-xl border border-content/20 border-dashed bg-content/10 px-3.5 py-3 shadow-xl backdrop-blur-xl"
          role="status"
        >
          <CircleAlert
            className="size-3.5 shrink-0 text-amber-400"
            strokeWidth={1.75}
          />
          <span className="text-[13px] text-content">
            {LOCKED_NOTIFICATION_TEXT}
          </span>
        </article>
      ) : null}
    </div>,
    document.body,
  );
}

function ProjectApprovalToast(props: {
  notice: Notice;
  onFocusSession: Props["onFocusSession"];
  onApproval: Props["onApproval"];
}) {
  useLocale();
  const path = props.notice.session.cwd;
  // The keyed gate stays mounted even while hidden. Resuming notifications
  // must not turn a pending request into a new popup.
  const [occurredAt] = useState(Date.now);
  const project = knownNotificationProject(path);

  if (
    !project ||
    !allowsProjectNotification({
      projectId: project.id,
      category: "agentInput",
      occurredAt,
    })
  )
    return null;
  return <ApprovalToastCard {...props} />;
}

function ApprovalToastCard({
  notice,
  onFocusSession,
  onApproval,
}: {
  notice: Notice;
  onFocusSession: (sessionId: string) => void;
  onApproval: Props["onApproval"];
}) {
  useLocale();
  const { session, label, requestId } = notice;
  const title = sessionDisplayTitle(session.title, session.harness);
  const harness = HARNESS_TITLE[session.harness];

  const openSession = () => onFocusSession(session.id);

  return (
    <article
      className="approval-toast pointer-events-auto overflow-hidden rounded-xl border border-content/20 border-dashed bg-content/10 shadow-xl backdrop-blur-xl"
      role="status"
    >
      <button
        type="button"
        onClick={openSession}
        className="flex w-full flex-col gap-2 px-3.5 py-3 text-left hover:bg-content/5"
      >
        <span className="flex items-center gap-2">
          <HarnessIcon harness={session.harness} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug text-content">
            {title}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-amber-400">
            <CircleAlert className="size-3.5" strokeWidth={1.75} />
            <span>{notice.kind === "question" ? t("Question") : t("Approval")}</span>
          </span>
        </span>
        <span className="line-clamp-3 text-[12px] leading-relaxed text-content/70">
          {label}
        </span>
        <span className="text-[11px] text-content/40">{harness}</span>
      </button>
      {notice.kind === "question" ? null : (
        <div className="flex gap-2 border-t border-stroke px-3.5 py-2.5">
          <button
            type="button"
            className="flex-1 rounded-md bg-content px-2.5 py-1 text-[11px] font-medium text-background-base hover:bg-content/80"
            onClick={() => onApproval(session.id, requestId, "allow")}
          >{t("Allow")}</button>
          <button
            type="button"
            className="flex-1 rounded-md bg-content/10 px-2.5 py-1 text-[11px] font-medium text-content/70 hover:bg-content/20"
            onClick={() => onApproval(session.id, requestId, "deny")}
          >{t("Deny")}</button>
        </div>
      )}
    </article>
  );
}
