import { describe, expect, it } from "vitest";
import { sandboxHtmlDocument } from "./types";
describe("HTML sandbox policy", () => {
  it("puts the restrictive policy before attacker-supplied markup", () => {
    const document = sandboxHtmlDocument('<script>fetch("https://example.com")</script><meta http-equiv="Content-Security-Policy" content="default-src *">');
    expect(document.indexOf("default-src 'none'")).toBeLessThan(document.indexOf("<script>"));
    expect(document).toContain("connect-src 'none'"); expect(document).toContain("form-action 'none'"); expect(document).toContain("base-uri 'none'");
  });
});
