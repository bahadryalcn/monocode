import { parseSpreadsheet } from "./spreadsheet";
import { documentErrorMessage } from "./documentViewer";

self.onmessage = (event: MessageEvent<Uint8Array>) => {
  try {
    self.postMessage({ ok: true, book: parseSpreadsheet(event.data) });
  } catch (cause) {
    self.postMessage({ ok: false, message: documentErrorMessage(cause) });
  }
};
