export interface HtmlArtifactSummary {
  id: string;
  sessionId: string;
  messageId?: string;
  title: string;
  createdAt: string;
  bytes: number;
}
export interface HtmlArtifact extends HtmlArtifactSummary { html: string }

/** Opaque origin, no network, forms, navigation permissions or host bridge. */
export function sandboxHtmlDocument(html: string): string {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta charset="utf-8"></head><body>${html}</body></html>`;
}
