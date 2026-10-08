import { createHash, randomUUID } from "node:crypto";

type Page = {
  goto(url: string, options: { timeout: number }): Promise<unknown>;
  url(): string;
  screenshot(options: { type: "jpeg"; quality: number; timeout: number }): Promise<Buffer>;
  mouse: { click(x: number, y: number): Promise<void>; wheel(x: number, y: number): Promise<void> };
  keyboard: { type(text: string): Promise<void>; press(key: string): Promise<void> };
};
type Browser = { newContext(options: { viewport: { width: number; height: number }; acceptDownloads: boolean }): Promise<{ newPage(): Promise<Page> }>; close(): Promise<void> };
export type BrowserLoader = () => Promise<{ chromium: { launch(options: { headless: boolean }): Promise<Browser> } }>;
const fingerprint = (credential: string) => createHash("sha256").update(credential).digest("hex");

export function sharedBrowserUrl(input: unknown) {
  if (typeof input !== "string" || input.length > 4096) throw new Error("Invalid browser URL");
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) URL without credentials");
  return url.href;
}

/** One host-owned ephemeral browser. No user profile, extension, download or
 * stored token is exposed. Viewing is shared; mutations require a short lease. */
export class SharedBrowser {
  private browser?: Browser;
  private page?: Page;
  private lease?: { owner: string; id: string; expiresAt: number };
  private busy = false;
  private lastUse = 0;
  private idleTimer?: ReturnType<typeof setInterval>;
  constructor(private readonly loader: BrowserLoader = async () => {
    // Keep optional runtime dependency out of the host bundle. Explicit setup:
    // install playwright in the host runtime, then `playwright install chromium`.
    const moduleName = "playwright";
    try { return await import(/* @vite-ignore */ moduleName) as Awaited<ReturnType<BrowserLoader>>; }
    catch { throw new Error("Shared browser requires Playwright on this host. Install playwright in the host runtime and run playwright install chromium, then retry. No automatic download was attempted."); }
  }, private readonly now = Date.now) {}

  async dispatch(method: string, params: Record<string, unknown>, credential: string) {
    if (this.busy) throw new Error("Shared browser is busy; retry after the current request");
    this.busy = true;
    try {
      const at = this.now();
      this.lastUse = at;
      if (this.lease && this.lease.expiresAt <= at) this.lease = undefined;
      const owner = fingerprint(credential);
      if (method === "browser.status") return this.status(owner);
      if (method === "browser.claim") {
        if (this.lease && this.lease.owner !== owner) throw new Error("Another device controls this browser");
        this.lease = { owner, id: this.lease?.id ?? randomUUID(), expiresAt: at + 30_000 };
        return this.status(owner);
      }
      if (method === "browser.release") { this.requireLease(owner, params); this.lease = undefined; return this.status(owner); }
      if (method === "browser.open") {
        this.requireLease(owner, params);
        const url = sharedBrowserUrl(params.url);
        await this.ensurePage();
        await this.page!.goto(url, { timeout: 15_000 });
        return this.status(owner);
      }
      if (method === "browser.frame") {
        if (!this.page) throw new Error("Open a shared browser first");
        const frame = await this.page.screenshot({ type: "jpeg", quality: 65, timeout: 5_000 });
        if (frame.byteLength > 2 * 1024 * 1024) throw new Error("Browser frame exceeds transfer budget");
        return { ...this.status(owner), mimeType: "image/jpeg", data: frame.toString("base64"), width: 1280, height: 720 };
      }
      if (method === "browser.close") { this.requireLease(owner, params); await this.close(); return this.status(owner); }
      if (method === "browser.input") {
        this.requireLease(owner, params);
        if (!this.page) throw new Error("Open a shared browser first");
        if (params.kind === "click") {
          const x = Number(params.x), y = Number(params.y);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1280 || y < 0 || y > 720) throw new Error("Invalid click position");
          await this.page.mouse.click(x, y);
        } else if (params.kind === "scroll") {
          const y = Number(params.y);
          if (!Number.isFinite(y) || Math.abs(y) > 2000) throw new Error("Invalid scroll distance");
          await this.page.mouse.wheel(0, y);
        } else if (params.kind === "text") {
          if (typeof params.text !== "string" || params.text.length > 4096 || params.text.includes("\0")) throw new Error("Invalid browser text");
          await this.page.keyboard.type(params.text);
        } else if (params.kind === "key") {
          if (!["Enter", "Tab", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(String(params.key))) throw new Error("Unsupported browser key");
          await this.page.keyboard.press(String(params.key));
        } else throw new Error("Unsupported browser input");
        return this.status(owner);
      }
      throw new Error("Unsupported browser method");
    } finally { this.busy = false; }
  }
  private status(owner: string) {
    return { open: !!this.page, url: this.page?.url() ?? null, controlling: this.lease?.owner === owner,
      leaseId: this.lease?.owner === owner ? this.lease.id : undefined, leaseExpiresAt: this.lease?.expiresAt,
      setup: "Install playwright in the host runtime and run playwright install chromium", viewport: { width: 1280, height: 720 } };
  }
  private requireLease(owner: string, params: Record<string, unknown>) {
    if (!this.lease || this.lease.owner !== owner || this.lease.id !== params.leaseId) throw new Error("Claim browser control before changing it");
    this.lease.expiresAt = this.now() + 30_000;
  }
  private async ensurePage() {
    if (this.page) return;
    const { chromium } = await this.loader();
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: false });
      this.page = await context.newPage();
      this.browser = browser;
      this.idleTimer = setInterval(() => { if (!this.busy && this.now() - this.lastUse > 5 * 60_000) void this.close().catch(() => {}); }, 30_000);
      this.idleTimer.unref();
    } catch (error) { await browser.close(); throw error; }
  }
  revoke(credential: string) { if (this.lease?.owner === fingerprint(credential)) this.lease = undefined; }
  async close() {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = undefined;
    const browser = this.browser;
    this.page = undefined; this.browser = undefined; this.lease = undefined;
    await browser?.close();
  }
}
