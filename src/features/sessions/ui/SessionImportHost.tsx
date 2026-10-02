import { useEffect, useState } from "react";
import { OPEN_SESSION_IMPORT_EVENT } from "../import/importModel";
import { SessionImportDialog } from "./SessionImportDialog";

/**
 * Owns the import dialog so the rail menu and Settings can open it with an
 * event, without the app shell carrying any of its state.
 */
export function SessionImportHost({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SESSION_IMPORT_EVENT, show);
    return () => window.removeEventListener(OPEN_SESSION_IMPORT_EVENT, show);
  }, []);
  return open ? (
    <SessionImportDialog
      onClose={() => setOpen(false)}
      onImported={onImported}
    />
  ) : null;
}
