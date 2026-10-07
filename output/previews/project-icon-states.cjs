// Usage: node project-icon-states.cjs <label>   -> output/previews/project-icons-<label>-{dark,light}-{1x,2x}.png
const esbuild = require("../../node_modules/esbuild");
const fs = require("fs"), path = require("path"), cp = require("child_process");
const label = process.argv[2] || "after";
const root = path.resolve(__dirname, "../..");
const out = path.join(__dirname, "_icon-states.bundle.cjs");
esbuild.buildSync({ entryPoints: [path.join(__dirname, "project-icon-states.entry.tsx")], bundle: true, platform: "node", format: "cjs", outfile: out, jsx: "automatic", logLevel: "error" });
const { page } = require(out);
const css = fs.readFileSync(path.join(root, "src/styles/imece.css"), "utf8").replace(/@(import|source|plugin|custom-variant)[^;]*;/g, "");
const html = (theme) => `<!doctype html><html class="${theme === "light" ? "theme-light" : ""}"><meta charset="utf-8"><style>
${css}
:root{--bg:hsl(216 24% 4%);--fg:hsl(216 24% 92%);--acc:#a3acb8}
html.theme-light{--bg:hsl(216 24% 94%);--fg:hsl(216 24% 18%)}
body{margin:0;padding:12px;background:var(--bg);color:var(--fg);font:13px system-ui}
section{display:none}section.theme-${theme}{display:block}
h3,h4{margin:0 0 6px;font-size:11px;opacity:.6;text-transform:uppercase}
.cols{display:flex;gap:12px}.col{width:170px}
.row{display:flex;align-items:center;gap:8px;height:32px;padding:0 8px;border-radius:6px;box-sizing:border-box}
.row.selected{--x:0;background:color-mix(in srgb,var(--acc) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--acc) 25%,transparent)}
.logo{width:16px;height:16px;display:grid;place-items:center}
.row .imece-sigil-active{animation-play-state:paused}
.zoom{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;width:560px}
.z-svg{width:48px;height:48px}
.size-3\.5{width:14px;height:14px}
</style><body>${page()}</body></html>`;
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
for (const theme of ["dark", "light"]) {
  const f = path.join(__dirname, `_icon-states-${theme}.html`);
  fs.writeFileSync(f, html(theme));
  for (const dpr of [1, 2]) {
    const png = path.join(__dirname, `project-icons-${label}-${theme}-${dpr}x.png`);
    cp.spawnSync(chrome, ["--headless=new", "--disable-gpu", "--disable-lcd-text", `--force-device-scale-factor=${dpr}`, "--window-size=720,1330", `--screenshot=${png}`, "file:///" + f.split(path.sep).join("/")], { stdio: "ignore" });
    console.log(png, fs.existsSync(png));
  }
  fs.unlinkSync(f);
}
fs.unlinkSync(out);
