import type { HostSession } from "./protocol";
export function canApplyRemotePreview(current: HostSession | undefined, preview: HostSession): boolean {
  return !!current && current.session.id === preview.session.id && current.revision === preview.revision &&
    current.session.blocks.length === preview.session.blocks.length &&
    !!current.historyLoading === !!preview.historyLoading;
}
