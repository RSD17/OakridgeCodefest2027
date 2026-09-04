import { gsap } from "gsap";
import type { TransitionBeforePreparationEvent } from "astro:transitions/client";

// Shark-bite page transition

const TEETH = 11;
const JAW_ARC = 6;
const JAW_OPEN_TOP = -30;
const JAW_OPEN_BOTTOM = 130;
const JAW_CLOSED = 50;

// Playback pace, below 1 is slower
const SPEED = 0.6;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Deterministic 0-1 noise
function jitter(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// One jaw as a closed path, dir 1 is upper and -1 is lower
function jawPath(dir: 1 | -1): string {
  const salt = dir > 0 ? 1 : 2;
  const seg: string[] = [`M 0 ${-70 * dir}`, `L 100 ${-70 * dir}`];
  for (let i = TEETH; i >= 0; i--) {
    const x = (i / TEETH) * 100;
    const arc = Math.sin((x / 100) * Math.PI) * JAW_ARC * dir;
    seg.push(`L ${x.toFixed(2)} ${arc.toFixed(2)}`);
    if (i > 0) {
      // Tooth tip
      const lean = (jitter(i, salt) - 0.5) * 0.42;
      const xm = ((i - 0.5 + lean) / TEETH) * 100;
      const arcm = Math.sin((xm / 100) * Math.PI) * JAW_ARC * dir;
      const mid = 1 - Math.abs(i / TEETH - 0.5) * 2;
      const len = (4.6 + mid * 2.4 + jitter(i, salt + 7) * 2.6) * dir;
      seg.push(`L ${xm.toFixed(2)} ${(arcm + len).toFixed(2)}`);
    }
  }
  seg.push("Z");
  return seg.join(" ");
}

interface Hole {
  x: number;
  y: number;
  r: number;
  delay: number;
}
interface Bubble {
  x: number;
  y: number;
  r: number;
  delay: number;
  drift: number;
}

let holes: Hole[] = [];
let bubbles: Bubble[] = [];

function seed(w: number, h: number) {
  // Hole count scales with area
  const count = Math.min(Math.max(Math.round((w * h) / 16000), 55), 190);
  holes = Array.from({ length: count }, () => {
    const y = Math.random() * h;
    return {
      x: Math.random() * w,
      y,
      r: (0.1 + Math.random() * 0.2) * Math.max(w, h),
      // Higher water clears first
      delay: (y / h) * 0.5 + Math.random() * 0.16,
    };
  });
  bubbles = Array.from({ length: 26 }, () => ({
    x: Math.random() * w,
    y: h * (0.55 + Math.random() * 0.5),
    r: 2 + Math.random() * 7,
    delay: Math.random() * 0.5,
    drift: (Math.random() - 0.5) * 40,
  }));
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, reveal: number) {
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#17505c");
  grad.addColorStop(0.45, "#0d2b3d");
  grad.addColorStop(1, "#050b14");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (reveal > 0) {
    // Erode the water
    ctx.globalCompositeOperation = "destination-out";
    for (const hole of holes) {
      const local = (reveal - hole.delay) / Math.max(1 - hole.delay, 1e-3);
      if (local <= 0) continue;
      const r = Math.min(local, 1) * hole.r;
      if (r < 0.5) continue;
      const g = ctx.createRadialGradient(hole.x, hole.y, r * 0.4, hole.x, hole.y, r);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hole.x, hole.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // Rising bubbles
  const swarm = Math.sin(Math.min(reveal, 1) * Math.PI);
  if (swarm > 0.01) {
    for (const b of bubbles) {
      const life = (reveal - b.delay) / Math.max(1 - b.delay, 1e-3);
      if (life <= 0 || life >= 1) continue;
      const y = b.y - life * h * 0.75;
      const x = b.x + Math.sin(life * Math.PI * 2) * b.drift;
      const a = Math.sin(life * Math.PI) * 0.45 * swarm;
      ctx.strokeStyle = `rgba(158, 214, 220, ${a.toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, b.r * (0.6 + life * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

interface Stage {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  jawTop: SVGPathElement;
  jawBottom: SVGPathElement;
  jaws: SVGSVGElement;
  w: number;
  h: number;
}

function getStage(): Stage | null {
  const root = document.getElementById("page-transition");
  const canvas = document.getElementById("pt-veil") as HTMLCanvasElement | null;
  const jaws = document.getElementById("pt-jaws") as SVGSVGElement | null;
  const jawTop = document.getElementById("pt-jaw-top") as SVGPathElement | null;
  const jawBottom = document.getElementById("pt-jaw-bottom") as SVGPathElement | null;
  if (!root || !canvas || !jaws || !jawTop || !jawBottom) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const needW = Math.round(w * dpr);
  const needH = Math.round(h * dpr);
  // Resize only on a real size change, it clears the canvas
  if (canvas.width !== needW || canvas.height !== needH) {
    canvas.width = needW;
    canvas.height = needH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!jawTop.getAttribute("d")) {
    jawTop.setAttribute("d", jawPath(1));
    jawBottom.setAttribute("d", jawPath(-1));
  }
  return { root, canvas, ctx, jawTop, jawBottom, jaws, w, h };
}

function show(stage: Stage) {
  stage.root.style.opacity = "1";
  stage.root.style.visibility = "visible";
}

function hide(stage: Stage) {
  stage.root.style.opacity = "0";
  stage.root.style.visibility = "hidden";
  stage.ctx.clearRect(0, 0, stage.w, stage.h);
}

document.addEventListener("astro:before-preparation", (e: Event) => {
  const event = e as TransitionBeforePreparationEvent;
  const stage = getStage();
  if (!stage) return;

  seed(stage.w, stage.h);
  gsap.set(stage.canvas, { opacity: 0 });
  gsap.set(stage.jaws, { opacity: 1, x: 0 });

  if (prefersReducedMotion()) {
    show(stage);
    paint(stage.ctx, stage.w, stage.h, 0);
    gsap.set(stage.canvas, { opacity: 1 });
    gsap.set(stage.jaws, { opacity: 0 });
    return;
  }

  const originalLoader = event.loader;
  event.loader = async () => {
    show(stage);
    const top = { v: JAW_OPEN_TOP };
    const bottom = { v: JAW_OPEN_BOTTOM };
    const apply = () => {
      stage.jawTop.setAttribute("transform", `translate(0 ${top.v})`);
      stage.jawBottom.setAttribute("transform", `translate(0 ${bottom.v})`);
    };
    apply();

    const tl = gsap.timeline();
    tl.timeScale(SPEED);
    // Bite
    tl.to([top, bottom], {
      v: JAW_CLOSED,
      duration: 0.4,
      ease: "power3.in",
      onUpdate: apply,
    })
      // Impact jolt
      .fromTo(
        stage.jaws,
        { x: -7 },
        { x: 0, duration: 0.45, ease: "elastic.out(1, 0.32)" },
        ">-0.02",
      )
      // Water takes over
      .add(() => {
        paint(stage.ctx, stage.w, stage.h, 0);
        gsap.set(stage.canvas, { opacity: 1 });
      }, "<")
      .to(stage.jaws, { opacity: 0, duration: 0.35, ease: "power2.out" }, "<+0.15");

    // Fetch during the bite
    const loaded = originalLoader();
    await tl.then();
    await loaded;
  };
});

document.addEventListener("astro:after-swap", () => {
  const stage = getStage();
  if (!stage) return;

  // Repaint before revealing
  if (!holes.length) seed(stage.w, stage.h);
  gsap.set(stage.jaws, { opacity: 0 });
  gsap.set(stage.canvas, { opacity: 1 });
  paint(stage.ctx, stage.w, stage.h, 0);
  show(stage);

  if (prefersReducedMotion()) {
    hide(stage);
    return;
  }

  const state = { reveal: 0 };
  const surface = gsap.timeline({ onComplete: () => hide(stage) });
  surface.timeScale(SPEED);
  surface
    .to(state, {
      reveal: 1,
      duration: 1.05,
      ease: "power2.inOut",
      onUpdate: () => paint(stage.ctx, stage.w, stage.h, state.reveal),
    })
    // Settle
    .to(stage.canvas, { opacity: 0, duration: 0.35, ease: "power1.out" }, "-=0.35");
});
