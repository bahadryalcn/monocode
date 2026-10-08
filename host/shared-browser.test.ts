import { expect, it, vi } from "vitest";
import { SharedBrowser, sharedBrowserUrl, type BrowserLoader } from "./shared-browser";

it("loads lazily, enforces device control leases and rejects unsupported URLs/inputs", async () => {
  let now = 1_000;
  const page = { goto: vi.fn(), url: () => "http://localhost:3000/", screenshot: vi.fn(async () => Buffer.from("frame")), mouse: { click: vi.fn(), wheel: vi.fn() }, keyboard: { type: vi.fn(), press: vi.fn() } };
  const close = vi.fn();
  const loader: BrowserLoader = vi.fn(async () => ({ chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => page }), close }) } }));
  const browser = new SharedBrowser(loader, () => now);
  await browser.dispatch("browser.status", {}, "a");
  expect(loader).not.toHaveBeenCalled();
  const claim = await browser.dispatch("browser.claim", {}, "a");
  await expect(browser.dispatch("browser.claim", {}, "b")).rejects.toThrow("Another device");
  await expect(browser.dispatch("browser.open", { url: "http://localhost:3000", leaseId: claim.leaseId }, "b")).rejects.toThrow("Claim");
  await browser.dispatch("browser.open", { url: "http://localhost:3000", leaseId: claim.leaseId }, "a");
  expect(loader).toHaveBeenCalledTimes(1);
  const shared = await browser.dispatch("browser.frame", {}, "b");
  expect(shared.leaseId).toBeUndefined();
  expect(shared.data).toBe(Buffer.from("frame").toString("base64"));
  await expect(browser.dispatch("browser.input", { leaseId: claim.leaseId, kind: "click", x: -1, y: 2 }, "a")).rejects.toThrow("position");
  now += 31_000;
  const other = await browser.dispatch("browser.claim", {}, "b");
  expect(other.controlling).toBe(true);
  browser.revoke("b");
  await expect(browser.dispatch("browser.input", { leaseId: other.leaseId, kind: "text", text: "x" }, "b")).rejects.toThrow("Claim");
  await browser.close();
  expect(close).toHaveBeenCalledOnce();
});
it("restricts URL protocol and rejects embedded credentials", () => {
  expect(() => sharedBrowserUrl("file:///etc/passwd")).toThrow();
  expect(() => sharedBrowserUrl("https://user:secret@host.example")).toThrow();
  expect(sharedBrowserUrl("http://localhost:3000")).toBe("http://localhost:3000/");
});
