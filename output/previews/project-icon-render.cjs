var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  PROJECT_MASCOTS: () => PROJECT_MASCOTS,
  icons: () => icons
});
module.exports = __toCommonJS(stdin_exports);
var import_react3 = require("react");
var import_server = require("react-dom/server");

// src/features/projects/ui/ProjectMascot.tsx
var import_react2 = require("react");

// src/features/projects/model/projectCodeIcons.ts
var icon = (label, category, color, highlight, path, keywords) => ({ label, category, color, highlight, path, keywords });
var PROJECT_CODE_ICONS = {
  weave: {
    label: "Web / Frontend",
    category: "Development",
    keywords: "website browser taray\u0131c\u0131 site aray\xFCz react frontend",
    color: "#60a5fa",
    highlight: "#bae6fd",
    path: "M3 3h18v15H3zM5 8v8h14V8zM10 18h4v2h4v2H6v-2h4zM6 10h3v2H6zM11 10h6v2h-6zM6 13h11v1H6z"
  },
  bridge: {
    label: "Server / Backend",
    category: "Development",
    keywords: "sunucu servis backend hosting",
    color: "#fb923c",
    highlight: "#fde68a",
    path: "M4 2h16v6H4zM6 4v2h2V4zM4 9h16v6H4zM6 11v2h2v-2zM4 16h16v6H4zM6 18v2h2v-2z"
  },
  orbit: {
    label: "Database / Analytics",
    category: "Data",
    keywords: "veritaban\u0131 veri sql database analytics",
    color: "#a78bfa",
    highlight: "#e9d5ff",
    path: "M3 6a9 4 0 0 1 18 0v12a9 4 0 0 1-18 0zM5 6a7 2 0 0 0 14 0 7 2 0 0 0-14 0zM5 10v1a7 2 0 0 0 14 0v-1a7 2 0 0 1-14 0zM5 15v1a7 2 0 0 0 14 0v-1a7 2 0 0 1-14 0z"
  },
  union: {
    label: "Mobile app",
    category: "Development",
    keywords: "mobil telefon android ios uygulama",
    color: "#34d399",
    highlight: "#a7f3d0",
    path: "M7 1h10a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2zM7 5v14h10V5zM10 21h4v1h-4zM9 7h6v3H9zM9 12h2v2H9zM13 12h2v2h-2zM9 16h6v1H9z"
  },
  link: {
    label: "Library / Package",
    category: "Development",
    keywords: "k\xFCt\xFCphane paket module sdk library",
    color: "#fbbf24",
    highlight: "#fef3c7",
    path: "M12 2 22 7v11l-10 5L2 18V7zM5 8l7 3 7-3-7-3zM4 10v7l7 3v-7zM13 13v7l7-3v-7zM10 3l2-1 10 5-2 1z"
  },
  compass: {
    label: "Game",
    category: "Play",
    keywords: "oyun game controller kumanda",
    color: "#f472b6",
    highlight: "#fbcfe8",
    path: "M6 6h12c3 0 4 4 5 10 0 4-3 5-5 2l-2-2H8l-2 2c-2 3-5 2-5-2C2 10 3 6 6 6zM5 9v2H3v2h2v2h2v-2h2v-2H7V9zM16 9v2h2V9zM19 12v2h2v-2z"
  },
  braid: {
    label: "AI / Automation",
    category: "Development",
    keywords: "yapay zeka robot otomasyon agent ai",
    color: "#22d3ee",
    highlight: "#cffafe",
    path: "M11 1h2v3h-2zM5 4h14v3h2v12h-3v3H6v-3H3V7h2zM6 8v4h4V8zM14 8v4h4V8zM8 16v2h8v-2zM0 9h2v7H0zM22 9h2v7h-2z"
  },
  sprout: {
    label: "Design / Creative",
    category: "Creative",
    keywords: "tasar\u0131m sanat palet renk design",
    color: "#fb7185",
    highlight: "#fecdd3",
    path: "M12 2C5 2 1 6 1 12s5 10 11 10h2c3 0 3-3 1-4-2-1-1-3 1-3h3c6 0 5-13-7-13zM6 8a2 2 0 1 0 0 .1zM11 5a2 2 0 1 0 0 .1zM17 7a2 2 0 1 0 0 .1zM5 14a2 2 0 1 0 0 .1z"
  },
  terminal: icon(
    "Terminal",
    "Development",
    "#4ade80",
    "#bbf7d0",
    "M2 3h20v18H2zM4 5v14h16V5zM6 8l4 4-4 4-1-2 2-2-2-2zM12 14h6v2h-6z",
    "komut sat\u0131r\u0131 cli shell konsol terminal"
  ),
  api: icon(
    "API / Integration",
    "Development",
    "#38bdf8",
    "#e0f2fe",
    "M7 3h4v4H7zM3 7h4v4H3zM1 11h4v2H1zM3 13h4v4H3zM7 17h4v4H7zM13 3h4v4h-4zM17 7h4v4h-4zM19 11h4v2h-4zM17 13h4v4h-4zM13 17h4v4h-4zM11 8h2v8h-2z",
    "entegrasyon endpoint api rest graphql"
  ),
  desktop: icon(
    "Desktop app",
    "Development",
    "#818cf8",
    "#c7d2fe",
    "M2 2h20v17H2zM4 7v10h16V7zM4 4h2v1H4zM8 4h2v1H8zM9 19h6v2h5v2H4v-2h5zM6 9h5v6H6zM13 9h5v2h-5zM13 13h5v2h-5z",
    "masa\xFCst\xFC windows mac linux desktop tauri electron"
  ),
  git: icon(
    "Version control",
    "Development",
    "#f97316",
    "#fed7aa",
    "M5 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM4 8h2v8H4zM5 16a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM19 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM18 8h2v2c0 4-5 5-14 5v-2c8 0 12-1 12-3z",
    "git s\xFCr\xFCm dal branch repository repo"
  ),
  cloud: icon(
    "Cloud / Hosting",
    "Services",
    "#7dd3fc",
    "#f0f9ff",
    "M6 20a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12zM10 11v4H7l5 5 5-5h-3v-4z",
    "bulut hosting da\u011F\u0131t\u0131m deploy cloud"
  ),
  shield: icon(
    "Security",
    "Services",
    "#2dd4bf",
    "#ccfbf1",
    "M12 1 22 5v8c0 5-5 9-10 11C7 22 2 18 2 13V5zM7 12l3 3 7-7 2 2-9 9-5-5z",
    "g\xFCvenlik g\xFCvenlik duvar\u0131 auth \u015Fifre security firewall"
  ),
  wallet: icon(
    "Wallet / Payments",
    "Services",
    "#facc15",
    "#fef9c3",
    "M3 3h16v4h3v14H2V5zM4 5v2h13V5zM14 10v8h8v-8zM17 13h2v2h-2z",
    "c\xFCzdan \xF6deme finans para wallet payment fintech"
  ),
  shop: icon(
    "Commerce / Store",
    "Services",
    "#fda4af",
    "#fff1f2",
    "M3 2h18l2 8H1zM3 12h18v10H3zM5 14v6h5v-6zM13 14v8h6v-8zM3 5h3v4H3zM10 5h3v4h-3zM17 5h3v4h-3z",
    "ma\u011Faza e ticaret al\u0131\u015Fveri\u015F commerce shop store"
  ),
  chart: icon(
    "Reports / Metrics",
    "Data",
    "#c084fc",
    "#f3e8ff",
    "M2 2h2v18h18v2H2zM6 13h4v5H6zM12 9h4v9h-4zM18 4h4v14h-4z",
    "rapor istatistik \xF6l\xE7\xFCm dashboard metrik chart"
  ),
  docs: icon(
    "Documentation",
    "Development",
    "#94a3b8",
    "#e2e8f0",
    "M5 1h10l5 5v17H5zM14 2v5h5zM8 10h9v2H8zM8 14h9v2H8zM8 18h6v2H8z",
    "dok\xFCman belge rehber readme wiki docs documentation"
  ),
  music: icon(
    "Music / Audio",
    "Creative",
    "#e879f9",
    "#fae8ff",
    "M9 4 22 1v16a4 3 0 1 1-3-3V6l-7 2v12a4 3 0 1 1-3-3z",
    "m\xFCzik ses audio music podcast"
  ),
  video: icon(
    "Video / Motion",
    "Creative",
    "#f87171",
    "#fee2e2",
    "M2 4h20v17H2zM4 8v11h16V8zM4 5h3v2H4zM10 5h3v2h-3zM16 5h3v2h-3zM10 10l6 3-6 4z",
    "video film animasyon motion remotion"
  ),
  camera: icon(
    "Photo / Camera",
    "Creative",
    "#f0abfc",
    "#fdf4ff",
    "M7 3h10l2 4h4v14H1V7h4zM12 9a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3 9h3v2H3z",
    "foto\u011Fraf resim kamera photo image camera"
  ),
  education: icon(
    "Education",
    "Everyday",
    "#a3e635",
    "#ecfccb",
    "M12 1 24 7 12 13 0 7zM5 12l7 3 7-3v7c-4 3-10 3-14 0zM22 9h2v10h-2z",
    "e\u011Fitim okul \xF6\u011Frenme kurs ders education school"
  ),
  health: icon(
    "Health / Care",
    "Everyday",
    "#f43f5e",
    "#ffe4e6",
    "M12 6C5-2-3 6 3 13l9 10 9-10c6-7-2-15-9-7zM10 9h4v4h4v4h-4v4h-4v-4H6v-4h4z",
    "sa\u011Fl\u0131k bak\u0131m t\u0131p kalp health medical care"
  ),
  globe: icon(
    "Network / Web",
    "Services",
    "#67e8f9",
    "#ecfeff",
    "M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zM11 3C6 7 6 17 11 21V3zM13 3v18c5-4 5-14 0-18zM3 10v4h18v-4z",
    "a\u011F internet d\xFCnya global network web"
  ),
  launch: icon(
    "Launch / Startup",
    "Services",
    "#fbbf77",
    "#ffedd5",
    "M12 1c6 4 7 10 4 16H8c-3-6-2-12 4-16zM12 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 11l-5 9h5zM17 11l5 9h-5zM9 19h6l-3 5z",
    "roket ba\u015Flang\u0131\xE7 lansman giri\u015Fim startup launch rocket"
  ),
  tools: icon(
    "Tools / Utilities",
    "Development",
    "#d4d4d8",
    "#fafafa",
    "M19 1l-3 5 2 2 5-3c2 6-3 10-8 7L7 22a3 3 0 0 1-5-4l10-8C9 5 13 0 19 1zM4 19h2v2H4z",
    "ara\xE7 yard\u0131mc\u0131 tamir utility tool wrench"
  ),
  coffee: icon(
    "Coffee / Personal",
    "Everyday",
    "#d6a77a",
    "#f5e6d3",
    "M2 7h15v3h5v8h-6c-2 4-10 4-12 0zM17 12v4h3v-4zM1 22h20v2H1zM5 1h2v4H5zM10 1h2v4h-2z",
    "kahve \xE7ay ki\u015Fisel hobi coffee personal tea"
  ),
  archive: icon(
    "Storage / Archive",
    "Data",
    "#a8a29e",
    "#e7e5e4",
    "M2 2h20v6H2zM4 9h16v13H4zM8 11h8v4H8zM10 12v1h4v-1z",
    "depolama ar\u015Fiv dosya storage archive backup yedek"
  ),
  calendar: icon(
    "Calendar / Planning",
    "Everyday",
    "#fdba74",
    "#fff7ed",
    "M5 1h3v4H5zM16 1h3v4h-3zM2 3h20v20H2zM4 9v12h16V9zM6 11h3v3H6zM11 11h3v3h-3zM16 11h2v3h-2zM6 16h3v3H6zM11 16h3v3h-3z",
    "takvim plan zaman etkinlik g\xF6rev calendar task planning"
  ),
  mail: icon(
    "Mail / Messages",
    "Everyday",
    "#93c5fd",
    "#dbeafe",
    "M1 4h22v17H1zM3 6l9 7 9-7H3zM3 10v9h18v-9l-9 7z",
    "posta ileti\u015Fim mesaj eposta mail email chat"
  ),
  network: icon(
    "Infrastructure",
    "Development",
    "#5eead4",
    "#f0fdfa",
    "M8 1h8v7H8zM11 8h2v4h7v4h-2v-2H6v2H4v-4h7zM1 17h8v6H1zM15 17h8v6h-8z",
    "altyap\u0131 mimari ba\u011Flant\u0131 servis infrastructure network docker"
  ),
  lab: icon(
    "Lab / Experiments",
    "Data",
    "#bef264",
    "#f7fee7",
    "M8 1h8v3h-2v6l8 11c1 2-1 3-3 3H5c-2 0-4-1-3-3l8-11V4H8zM7 15l-4 6h18l-4-6zM11 5v7h2V5z",
    "laboratuvar deney ara\u015Ft\u0131rma test lab experiment science"
  )
};

// src/features/projects/model/projectMascots.ts
var MASCOT_GRID = 24;
var LEGACY_SIGILS = {
  invader: "weave",
  ghost: "orbit",
  robot: "bridge",
  cat: "link",
  skull: "compass",
  crab: "union",
  mushroom: "sprout",
  rocket: "compass",
  dino: "bridge",
  frog: "braid"
};
var PROJECT_MASCOTS = Object.keys(
  PROJECT_CODE_ICONS
).map((name) => {
  const { path, ...appearance } = PROJECT_CODE_ICONS[name];
  return {
    name,
    ...appearance,
    rest: [],
    talk: [],
    restPath: path,
    talkPath: path
  };
});
var DEFAULT_PROJECT_MASCOT_NAMES = [
  "weave",
  "bridge",
  "orbit",
  "union",
  "link",
  "compass",
  "braid",
  "sprout"
];
function normalizeProjectMascotName(name) {
  if (!name) return null;
  const resolved = Object.prototype.hasOwnProperty.call(LEGACY_SIGILS, name) ? LEGACY_SIGILS[name] : name;
  return PROJECT_MASCOTS.some((sigil) => sigil.name === resolved) ? resolved : null;
}
function projectMascot(project, name) {
  const resolvedName = normalizeProjectMascotName(name);
  const chosen = PROJECT_MASCOTS.find((sigil) => sigil.name === resolvedName);
  if (chosen) return chosen;
  let hash = 0;
  for (let i = 0; i < project.length; i++)
    hash = hash * 131 + project.charCodeAt(i) >>> 0;
  return PROJECT_MASCOTS.find(
    (icon2) => icon2.name === DEFAULT_PROJECT_MASCOT_NAMES[hash % DEFAULT_PROJECT_MASCOT_NAMES.length]
  );
}

// src/features/settings/model/decorativeMotion.ts
var import_react = require("react");

// src/features/settings/model/storageFlags.ts
function readFlag(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return raw === "1" || raw === "true";
  } catch {
    return null;
  }
}

// src/features/settings/model/decorativeMotion.ts
var DECORATIVE_MOTION_KEY = "monocode.decorativeMotion.v1";
var DECORATIVE_MOTION_CHANGE_EVENT = "monocode:decorativemotionchange";
var DECORATIVE_MOTION_DEFAULT = true;
var REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
var unsaved = null;
var media = null;
var listeners = /* @__PURE__ */ new Set();
function loadDecorativeMotionEnabled() {
  return unsaved ?? readFlag(DECORATIVE_MOTION_KEY) ?? DECORATIVE_MOTION_DEFAULT;
}
function reducedMotionMedia() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY);
}
function prefersReducedMotion() {
  return (media ?? reducedMotionMedia())?.matches ?? false;
}
function decorativeMotionEnabled() {
  return loadDecorativeMotionEnabled() && !prefersReducedMotion();
}
function notify() {
  for (const listener of listeners) listener();
}
function onStorage(event) {
  if (event.key !== DECORATIVE_MOTION_KEY && event.key !== null) return;
  unsaved = null;
  notify();
}
function subscribeDecorativeMotion(listener) {
  if (typeof window === "undefined") return () => {
  };
  const subscription = () => listener();
  listeners.add(subscription);
  if (listeners.size === 1) {
    media = reducedMotionMedia();
    media?.addEventListener("change", notify);
    window.addEventListener(DECORATIVE_MOTION_CHANGE_EVENT, notify);
    window.addEventListener("storage", onStorage);
  }
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    listeners.delete(subscription);
    if (listeners.size !== 0) return;
    media?.removeEventListener("change", notify);
    media = null;
    window.removeEventListener(DECORATIVE_MOTION_CHANGE_EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
}
function useDecorativeMotionEnabled() {
  return (0, import_react.useSyncExternalStore)(
    subscribeDecorativeMotion,
    decorativeMotionEnabled,
    () => false
  );
}

// src/features/projects/ui/ProjectMascot.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var CODE_ROWS = Array.from({ length: 20 }, (_, row) => ({
  y: 1.2 + row * 1.18,
  text: ["const<>();{}[]", "01=>let:{};/", "</>run(x);01"][row % 3].repeat(3)
}));
function ProjectMascot({
  project,
  color,
  name,
  className = "size-3 shrink-0",
  active = false
}) {
  const mascot = projectMascot(project, name);
  const id = (0, import_react2.useId)().replace(/:/g, "");
  const clipId = `project-code-${id}`;
  const gradientId = `project-color-${id}`;
  const motionEnabled = useDecorativeMotionEnabled();
  const animate = active && motionEnabled;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      "aria-hidden": true,
      viewBox: `0 0 ${MASCOT_GRID} ${MASCOT_GRID}`,
      className: `${className} ${animate ? "imece-sigil-active" : ""}`,
      "data-project-icon": mascot.name,
      "data-project-icon-label": mascot.label,
      style: { color: color ?? mascot.color },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("clipPath", { id: clipId, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: mascot.restPath, clipRule: "evenodd" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: gradientId, x1: "0", y1: "0", x2: "1", y2: "1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0", stopColor: mascot.highlight }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: ".55", stopColor: "currentColor" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "1", stopColor: "currentColor", stopOpacity: ".85" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "g",
          {
            clipPath: `url(#${clipId})`,
            fill: `url(#${gradientId})`,
            fontFamily: "monospace",
            fontSize: "1.65",
            fontWeight: "600",
            children: CODE_ROWS.map(({ y, text }, row) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "text",
              {
                x: row % 2 ? -0.3 : 0,
                y,
                textLength: "32",
                lengthAdjust: "spacingAndGlyphs",
                xmlSpace: "preserve",
                children: text
              },
              row
            ))
          }
        )
      ]
    }
  );
}

// <stdin>
function icons() {
  return (0, import_server.renderToStaticMarkup)((0, import_react3.createElement)("div", null, ...PROJECT_MASCOTS.map((m, i) => (0, import_react3.createElement)("button", { key: m.name, type: "button", className: "pi-item", title: m.label, "aria-label": m.label, "aria-pressed": i === 0, "data-label": m.label, "data-category": m.category, "data-search": m.label + " " + m.keywords }, (0, import_react3.createElement)(ProjectMascot, { project: "preview", name: m.name }), (0, import_react3.createElement)("span", null, m.label.split(" / ")[0]), (0, import_react3.createElement)("div", { className: "pi-mini" }, (0, import_react3.createElement)(ProjectMascot, { project: "small", name: m.name }), (0, import_react3.createElement)(ProjectMascot, { project: "menu", name: m.name })))))).slice(5, -6);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PROJECT_MASCOTS,
  icons
});
