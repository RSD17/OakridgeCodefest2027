import { gsap } from "gsap";
import { triggerWaterSplash } from "../three/homeDepth";

// Splash effects

const IGNORE_SELECTOR = "a, button, input, textarea, select, .glass, [data-no-splash]";
const LAYER_ID = "splash-layer";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getLayer(): HTMLElement {
  let layer = document.getElementById(LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.className = "pointer-events-none fixed inset-0 z-[60] overflow-hidden";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  return layer;
}

function spawnDroplets(x: number, y: number) {
  if (prefersReducedMotion()) return;

  const layer = getLayer();
  const wrap = document.createElement("div");
  wrap.style.position = "absolute";
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;
  layer.appendChild(wrap);

  const ring = document.createElement("span");
  ring.style.position = "absolute";
  ring.style.left = "0";
  ring.style.top = "0";
  ring.style.width = "14px";
  ring.style.height = "14px";
  ring.style.borderRadius = "9999px";
  ring.style.background = "radial-gradient(circle, transparent 48%, rgba(225, 255, 252, 0.42) 52%, rgba(225, 255, 252, 0.18) 58%, transparent 68%)";
  ring.style.filter = "blur(0.4px)";
  wrap.appendChild(ring);

  gsap.set(ring, { xPercent: -50, yPercent: -50, scale: 0.35, opacity: 0.7 });
  gsap.to(ring, {
    scale: 3,
    opacity: 0,
    duration: 0.42,
    ease: "power2.out",
  });

  const mistCount = 5;
  for (let i = 0; i < mistCount; i++) {
    const mist = document.createElement("span");
    const size = 1 + Math.random() * 1.4;
    mist.style.position = "absolute";
    mist.style.left = "0";
    mist.style.top = "0";
    mist.style.width = `${size}px`;
    mist.style.height = `${size}px`;
    mist.style.borderRadius = "9999px";
    mist.style.background = "rgba(225, 255, 252, 0.75)";
    mist.style.boxShadow = "0 0 5px rgba(204, 255, 249, 0.35)";
    wrap.appendChild(mist);

    const angle = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * 18;
    gsap.set(mist, { xPercent: -50, yPercent: -50, opacity: 0.55 });
    gsap.to(mist, {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * 0.45 - 6,
      opacity: 0,
      scale: 0.25,
      duration: 0.32 + Math.random() * 0.18,
      ease: "power2.out",
    });
  }

  const dropletCount = 6;
  for (let i = 0; i < dropletCount; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
    const dist = 14 + Math.random() * 28;
    const width = 1.3 + Math.random() * 1.6;
    const height = width * (1.6 + Math.random() * 1.4);
    const dot = document.createElement("span");
    dot.style.position = "absolute";
    dot.style.left = "0";
    dot.style.top = "0";
    dot.style.width = `${width}px`;
    dot.style.height = `${height}px`;
    dot.style.borderRadius = "9999px";
    dot.style.background = "linear-gradient(180deg, rgba(248, 250, 252, 0.95), rgba(191, 219, 254, 0.38) 62%, rgba(116, 192, 201, 0.12))";
    dot.style.boxShadow = "0 0 7px rgba(206, 255, 249, 0.28)";
    dot.style.filter = "blur(0.05px)";
    dot.style.transformOrigin = "50% 50%";
    wrap.appendChild(dot);

    gsap.set(dot, { xPercent: -50, yPercent: -50, opacity: 0.78, rotate: (angle + Math.PI / 2) * (180 / Math.PI) });
    const flightX = Math.cos(angle) * dist;
    const riseY = Math.sin(angle) * dist * 0.6 - 10 - Math.random() * 16;
    const tl = gsap.timeline();
    tl.to(dot, { x: flightX * 0.62, y: riseY, duration: 0.18 + Math.random() * 0.08, ease: "power2.out" }).to(dot, {
      x: flightX,
      y: riseY + 22 + Math.random() * 16,
      opacity: 0,
      scaleX: 0.45,
      scaleY: 0.8,
      duration: 0.34 + Math.random() * 0.16,
      ease: "power1.in",
    });
  }

  setTimeout(() => wrap.remove(), 800);
}

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.closest(IGNORE_SELECTOR)) return;
  triggerWaterSplash(e.clientX, e.clientY);
  spawnDroplets(e.clientX, e.clientY);
}

// Home-only splash binding
function bind() {
  if (document.getElementById("home-hero")) {
    document.addEventListener("click", onClick);
  }
}

function unbind() {
  document.removeEventListener("click", onClick);
  document.getElementById(LAYER_ID)?.remove();
}

document.addEventListener("astro:page-load", bind);
document.addEventListener("astro:before-swap", unbind);
