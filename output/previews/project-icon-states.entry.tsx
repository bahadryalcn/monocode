// Preview harness: renders project icons at real rail sizes in dark/light,
// normal / selected / running states. Built with esbuild by project-icon-states.cjs.
import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";

// Every standalone render restarts useId, so make SVG ids unique per icon
// (the real app renders everything in one tree and gets unique ids).
let uid = 0;
const renderToStaticMarkup = (el: any) => render(el).replace(/_R_/g, `_R${uid++}_`);
import { ProjectMascot } from "../../src/features/projects/ui/ProjectMascot";
import { PROJECT_MASCOTS } from "../../src/features/projects/model/projectMascots";

const SAMPLE = ["weave","bridge","orbit","union","link","compass","braid","sprout","terminal","git","cloud","shield","wallet","shop","chart","docs","music","video","health","globe","launch","tools","coffee","archive","calendar","lab","education","camera"];
const STATES = ["normal", "selected", "running"] as const;

function row(name: string, state: string, size: string) {
  const m = PROJECT_MASCOTS.find((x) => x.name === name)!;
  const icon = renderToStaticMarkup(createElement(ProjectMascot, { project: name, name, className: size }));
  const cls = state === "running" ? icon.replace(/class="/, 'class="imece-sigil-active ') : icon;
  return `<div class="row ${state}" ${state==="selected"?"data-selected":""}><span class="logo">${cls}</span><span class="lbl">${m.label.split(" / ")[0]}</span></div>`;
}

export function page() {
  const themes = ["dark", "light"];
  const sections = themes.map((theme) => {
    const cols = STATES.map((state) =>
      `<div class="col"><h4>${state}</h4>${SAMPLE.map((n) => row(n, state, "size-3.5")).join("")}</div>`).join("");
    const zoom = `<div class="zoom">${SAMPLE.map((n) => `<span class="z">${renderToStaticMarkup(createElement(ProjectMascot, { project: n, name: n, className: "z-svg" }))}</span>`).join("")}</div>`;
    return `<section class="theme-${theme}"><h3>${theme}</h3><div class="cols">${cols}</div>${zoom}</section>`;
  }).join("");
  return sections;
}
