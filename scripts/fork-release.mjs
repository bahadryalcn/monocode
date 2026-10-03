import {
  readFileSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const version = JSON.parse(read("package.json")).version;
const tag = process.env.GITHUB_REF_NAME;
const repository = "bahadryalcn/monocode";
if (tag !== `v${version}` || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Release tag must match the stable app version");
}
if (
  JSON.parse(read("src-tauri/tauri.conf.json")).version !== version ||
  !read("Cargo.toml").includes(`version = "${version}"`)
) {
  throw new Error("App version files disagree");
}
const config = JSON.parse(read("src-tauri/tauri.fork.conf.json"));
if (
  config.identifier !== "com.monocode.desktop.fork" ||
  !config.bundle.createUpdaterArtifacts ||
  !config.plugins.updater.pubkey ||
  config.plugins.updater.endpoints[0] !==
    `https://github.com/${repository}/releases/latest/download/latest.json`
) {
  throw new Error("Fork updater configuration is invalid");
}
if (process.argv[2] === "validate") {
  console.log(`Validated ${tag}`);
} else if (process.argv[2] === "feed") {
  const bundle = join(root, "target/release/bundle/nsis");
  const installers = readdirSync(bundle).filter(
    (name) => name.endsWith(".exe") && name.includes(`_${version}_`),
  );
  if (installers.length !== 1) throw new Error("Expected one NSIS installer");
  const name = installers[0];
  const signature = readFileSync(join(bundle, `${name}.sig`), "utf8").trim();
  if (!signature) throw new Error("Missing installer signature");
  const out = join(root, "release-artifacts");
  mkdirSync(out, { recursive: true });
  for (const asset of [name, `${name}.sig`])
    copyFileSync(join(bundle, asset), join(out, asset));
  writeFileSync(
    join(out, "latest.json"),
    JSON.stringify(
      {
        version,
        notes: `MonoCode ${version}. Release notes: https://github.com/${repository}/releases/tag/${tag}`,
        pub_date: new Date().toISOString(),
        platforms: {
          "windows-x86_64": {
            signature,
            url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(name)}`,
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Generated update feed for ${tag}`);
} else {
  throw new Error("Usage: node scripts/fork-release.mjs validate|feed");
}
