import { t, useLocale } from "../../../shared/i18n";
import { useEffect, useRef, useState } from "react";
import { shouldRunLoop } from "../../../shared/lib/animationGate";
import { useDecorativeMotionEnabled } from "../../settings/model/decorativeMotion";
import { createCodeArtPainter, CODE_WIDTH, CODE_HEIGHT, type TeaPose } from "./coffeehouseCodeArt";
import "./VillageCoffeehouseScene.css";
import { useShellSessions } from "../model/sessionsStore";
import { coffeehouseWorkingCount } from "../model/coffeehouseActivity";
import { coffeehouseMotionAt, converseWithNeighbours, applySmokingBreak, applyConversationMood, applyIdleLife } from "./coffeehouseMotion";
import { coffeehouseLayout } from "./coffeehouseLayout";

/** Six staggered tea sips, with long still intervals and no body movement. */
export function coffeehouseActionAt(id: number, elapsed: number): TeaPose {
  const phase = elapsed - 1500 - id * 5500;
  if (phase < 0) return "idle";
  const moment = phase % 36000;
  if (moment < 180) return "sip-low";
  if (moment < 360) return "sip-lift";
  if (moment < 540) return "sip-high";
  if (moment < 2100) return "sip";
  if (moment < 2300) return "sip-high";
  if (moment < 2500) return "sip-lift";
  if (moment < 2700) return "sip-low";
  return "idle";
}

export function VillageCoffeehouseScene({ className = "", variant = "hero", workingCount: previewCount }: {
  className?: string;
  variant?: "hero" | "background";
  workingCount?: number;
}) {
  useLocale();
  const sessions = useShellSessions();
  const workingCount = Math.max(0, Math.floor(previewCount ?? coffeehouseWorkingCount(sessions)));
  const standing = useRef<number[]>(Array(6).fill(0));
  const arrivals = useRef<number[]>(Array(6).fill(1));
  const displayedCount = useRef(6);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const startedAt = useRef<number | null>(null);
  const enabled = useDecorativeMotionEnabled();
  const [running, setRunning] = useState(false);
  const frame = variant === "background" ? 200 : 120;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    // WebView may defer the first observer callback: use the current bounds until it arrives.
    const bounds = element.getBoundingClientRect();
    let intersects = typeof IntersectionObserver === "undefined" || (bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight);
    const update = () => {
      setViewportWidth(element.clientWidth || 1280);
      setRunning(shouldRunLoop({ enabled, documentHidden: document.hidden,
        visible: intersects, sized: element.clientWidth > 0 && element.clientHeight > 0 }));
    };
    const intersection = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting; update();
    });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    intersection?.observe(element); resize?.observe(element);
    document.addEventListener("visibilitychange", update); window.addEventListener("resize", update); update();
    return () => { intersection?.disconnect(); resize?.disconnect();
      document.removeEventListener("visibilitychange", update); window.removeEventListener("resize", update); };
  }, [enabled]);
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    const draw = createCodeArtPainter(surface);
    let previous = "";
    let lastFrame = performance.now();
    const paint = (elapsed: number) => {
      const now = performance.now();
      const step = running ? Math.min(1, (now - lastFrame) / 600) : 1;
      lastFrame = now;
      // Shared expression clock (8 Hz hero, 5 Hz behind the transcript) keeps a crowd
      // from forcing a glyph repaint at display rate; unchanged frames are skipped.
      const expressionTime=Math.floor(elapsed/frame)*frame;
      displayedCount.current=Math.max(displayedCount.current,workingCount,6);
      const activity = Array.from({length: displayedCount.current}, (_, id) => {
        const target = id < workingCount ? 1 : 0;
        const current = standing.current[id] ?? (id>=6 ? 1 : 0);
        standing.current[id] = target > current ? Math.min(target, current + step) : Math.max(target, current - step);
        const arrival=arrivals.current[id] ?? 0;
        const arrivalStep=running ? step*.65 : 1;
        arrivals.current[id]=id<6 ? 1 : target ? Math.min(1,arrival+arrivalStep) : Math.max(0,arrival-arrivalStep);
        return {...coffeehouseMotionAt(id, expressionTime, id>=6 ? 1 : standing.current[id], running && !!target && arrivals.current[id]>.95),arrival:arrivals.current[id]};
      });
      while(displayedCount.current>Math.max(6,workingCount) && arrivals.current[displayedCount.current-1]===0) displayedCount.current--;
      activity.length=displayedCount.current;
      if(running) converseWithNeighbours(activity,coffeehouseLayout(displayedCount.current,viewportWidth)
        .filter(place=>place.id<workingCount),expressionTime);
      activity.forEach((state,id)=>{
        applyConversationMood(state,id,expressionTime,running && id<workingCount);
        applySmokingBreak(state,id,expressionTime,running);
        applyIdleLife(state,id,expressionTime,running);
      });
      const actions = Array.from({length: displayedCount.current}, (_, id) => id < workingCount || activity[id].smoking ? "idle" as const : coffeehouseActionAt(id, elapsed));
      const steamTime = running ? expressionTime : 0;
      const signature = actions.join("/") + JSON.stringify(activity) + steamTime;
      if (signature === previous) return;
      previous = signature;
      draw(actions, activity, viewportWidth, steamTime);
    };
    if (!running) { paint(0); return; }
    startedAt.current ??= performance.now();
    const start = startedAt.current;
    paint(performance.now() - start);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { paint(performance.now() - start); timer = setTimeout(tick, frame/2); };
    timer = setTimeout(tick, frame/2);
    return () => clearTimeout(timer);
  }, [running, workingCount, viewportWidth, frame]);
  return <div ref={container} className={`village-coffeehouse village-coffeehouse--${variant} ${className}`}
    data-variant={variant} data-motion={running ? "running" : "still"}
    data-working-count={workingCount}
    role={variant === "hero" ? "img" : undefined}
    aria-label={variant === "hero" ? t("{p0} men holding tea around a backgammon table; {p1} working agents. Monochrome binary code art.", { p0: Math.max(6,workingCount), p1: workingCount }) : undefined}
    aria-hidden={variant === "background" ? true : undefined}>
    <canvas key="code-art-layout-v2" ref={canvas} width={CODE_WIDTH} height={CODE_HEIGHT} aria-hidden="true" />
  </div>;
}
