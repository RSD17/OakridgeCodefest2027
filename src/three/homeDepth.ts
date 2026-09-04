import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { OceanShader } from "./oceanShader";
import { DepthScene } from "./sceneManager";
import { createShark, type Shark } from "./shark";
import { createMoteField, createCodeFragments } from "./particles";
import { createLightShaft } from "./lightShaft";

gsap.registerPlugin(ScrollTrigger);

function capableOfDepthEngine(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (!window.WebGLRenderingContext) return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
  if (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency < 4) return false;
  if (nav.connection?.saveData) return false;
  return true;
}

let oceanShader: OceanShader | null = null;
let depthScene: DepthScene | null = null;
let activeShark: Shark | null = null;
let scrollTriggers: ScrollTrigger[] = [];
// Navigation guard
let initToken = 0;

// Splash bridge
export function triggerWaterSplash(clientX: number, clientY: number) {
  oceanShader?.addSplash(clientX, clientY);
  // Disturbing the surface spooks the shark into a thrust burst.
  activeShark?.burst(0.5);
}

function teardown() {
  initToken++;
  scrollTriggers.forEach((t) => t.kill());
  scrollTriggers = [];
  detachPointer();
  activeShark = null;
  oceanShader?.dispose();
  oceanShader = null;
  depthScene?.dispose();
  depthScene = null;
}

function init() {
  teardown();
  const token = ++initToken;

  const root = document.getElementById("depth-engine-root");
  const oceanCanvas = document.getElementById("ocean-canvas") as HTMLCanvasElement | null;
  const sceneCanvas = document.getElementById("scene-canvas") as HTMLCanvasElement | null;
  if (!root || !oceanCanvas || !sceneCanvas) return;

  if (!capableOfDepthEngine()) {
    root.classList.add("hidden");
    gsap.set("#home-hero [data-reveal-hero]", { opacity: 1, y: 0 });
    return;
  }
  root.classList.remove("hidden");

  oceanShader = new OceanShader(oceanCanvas, { cursorEnabled: true, intensity: 0.5 });

  depthScene = new DepthScene(sceneCanvas);
  const { scene, camera } = depthScene;
  const REST_FOG = { near: 4, far: 15 };
  // Shark scale ceiling. The mascot has to read as dominant, so it carries a
  // good share of the viewport width rather than sitting as a distant
  // silhouette.
  const SHARK_SCALE = 5.4;
  // Share of the visible width the body should span. Phones get a bigger
  // share: a narrow screen shows far less water, so matching the desktop
  // fraction there would leave the mascot looking incidental. Sizing from the
  // viewport rather than a fixed floor keeps this stable at every width.
  const SPAN_NARROW = 0.72;
  const SPAN_WIDE = 0.36;
  // Swim path reference width
  const PATH_REF_HALF_WIDTH = 6.6;
  // Shark frame bounds: half-diagonal of the model in the XZ plane
  // (see public/models/shark.json), plus a little margin for the swim wave.
  const SHARK_HALF_EXTENT = 0.65;

  // Fog colour tracks the descent so the haze never glows lighter than the
  // water behind it once the background reaches the deep palette.
  const FOG_SURFACE = new THREE.Color(0x11525c);
  const FOG_ABYSS = new THREE.Color(0x070f1e);
  scene.fog = new THREE.Fog(FOG_SURFACE.getHex(), REST_FOG.near, REST_FOG.far);

  const ambient = new THREE.AmbientLight(0x74c0c9, 0.35);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xd6f0f3, 0.6);
  key.position.set(2, 4, 6);
  scene.add(key);

  const shark = createShark();
  shark.group.scale.setScalar(SHARK_SCALE);
  scene.add(shark.group);
  activeShark = shark;
  attachPointer(shark);

  // Swim path
  // One continuous route rather than a zigzag: two wide banking turns, each
  // carried out through depth so the shark arcs away from the camera and back
  // instead of reversing on the spot. Depth stays within roughly the same band
  // as the fog so it never dissolves entirely at the bottom of the descent.
  // Mid-scroll the camera sits at z 6.2 with fog far at 10, so the deepest
  // point here stays inside ~9.4 units of it and the shark stays readable.
  const swimPath = new THREE.CatmullRomCurve3(
    [
      // Enters high and off to the right
      new THREE.Vector3(6.4, 1.5, -4.0),
      // Long level glide left across the hero
      new THREE.Vector3(2.2, 0.7, -3.0),
      new THREE.Vector3(-2.4, -0.5, -2.7),
      // First turn, swinging out into deeper water
      new THREE.Vector3(-5.0, -1.9, -3.4),
      new THREE.Vector3(-2.6, -3.1, -3.2),
      // Long sweep back to the right at the floor of the descent
      new THREE.Vector3(2.0, -4.0, -3.4),
      new THREE.Vector3(4.4, -4.2, -3.0),
      // Second turn, drifting back up toward the surface
      new THREE.Vector3(1.2, -3.0, -2.7),
      new THREE.Vector3(-1.0, -2.0, -3.2),
    ],
    false,
    // Centripetal parameterisation cannot form the cusps and overshoots that
    // uniform Catmull-Rom produces between unevenly spaced points.
    "centripetal",
  );

  const pathPos = new THREE.Vector3();
  const pathTangent = new THREE.Vector3();
  const revealOffset = { x: 2.4, y: 2.6, z: -4.5 };
  // Reveal scale
  const revealState = { scale: 1 };

  let scrollTarget = 0;
  let scrollSmooth = 0;

  const pathTrigger = ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      scrollTarget = self.progress;
    },
  });
  scrollTriggers.push(pathTrigger);

  const lightShaft = createLightShaft();
  lightShaft.position.set(1.4, -1.2, -3);
  scene.add(lightShaft);

  const motes = createMoteField();
  scene.add(motes);
  // Drifting motes take their colour from the water around them: aqua up in
  // the shallows, cold blue once the light is gone.
  const MOTE_SURFACE = new THREE.Color(0x8fdde2);
  const MOTE_ABYSS = new THREE.Color(0x6f9fc4);
  const moteColor = (motes.material as THREE.ShaderMaterial).uniforms.u_color
    .value as THREE.Color;

  // The shark is lit by whatever water it is in: turquoise light off the
  // surface up top, only cold ambient blue once the sun is gone. Shading it
  // with fixed colours is what made it look pasted onto the scene.
  const SHARK_BASE_SURFACE = new THREE.Color(0x07222a);
  const SHARK_BASE_ABYSS = new THREE.Color(0x080f1c);
  const SHARK_GLOW_SURFACE = new THREE.Color(0x86d2d8);
  const SHARK_GLOW_ABYSS = new THREE.Color(0x5f93b0);
  const AMBIENT_SURFACE = new THREE.Color(0x74c0c9);
  const AMBIENT_ABYSS = new THREE.Color(0x4f7ea6);
  const KEY_SURFACE = new THREE.Color(0xd6f0f3);
  const KEY_ABYSS = new THREE.Color(0xb9cfe6);
  const sharkBase = shark.material.uniforms.u_baseColor.value as THREE.Color;
  const sharkGlow = shark.material.uniforms.u_glowColor.value as THREE.Color;

  const codeFragments = createCodeFragments();
  scene.add(codeFragments.group);

  depthScene.setFrameCallback((dt, elapsed) => {
    // Scroll smoothing
    const follow = 1 - Math.exp(-dt * 1.8);
    const prevSmooth = scrollSmooth;
    scrollSmooth += (scrollTarget - scrollSmooth) * follow;

    const t = THREE.MathUtils.clamp(scrollSmooth, 0, 1);
    swimPath.getPointAt(t, pathPos);
    swimPath.getTangentAt(t, pathTangent);

    const halfH = Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - pathPos.z);
    const halfW = halfH * camera.aspect;
    const fit = THREE.MathUtils.clamp(halfW / PATH_REF_HALF_WIDTH, 0, 1);

    // Responsive scale: solve for the scale that spans the target share of
    // the viewport, then cap it so wide screens never inflate past the ceiling.
    // Model length is exactly 1.0 (see public/models/shark.json), so the span
    // in world units is the scale itself.
    const span = THREE.MathUtils.lerp(
      SPAN_NARROW,
      SPAN_WIDE,
      THREE.MathUtils.smoothstep(camera.aspect, 0.5, 1.4),
    );
    const baseScale = Math.min(SHARK_SCALE, span * 2 * halfW);
    shark.group.scale.setScalar(baseScale * revealState.scale);

    pathPos.x *= fit;

    // Idle drift
    pathPos.x += Math.sin(elapsed * 0.31) * 0.28 * fit;
    pathPos.y += Math.sin(elapsed * 0.47 + 2.1) * 0.22;
    pathPos.z += Math.cos(elapsed * 0.27) * 0.2;

    pathPos.x += revealOffset.x * fit;
    pathPos.y += revealOffset.y;
    pathPos.z += revealOffset.z;

    // Viewport clamp
    const halfExtent = baseScale * SHARK_HALF_EXTENT;
    const maxX = Math.max(0, halfW - halfExtent * 0.75);
    pathPos.x = THREE.MathUtils.clamp(pathPos.x, -maxX, maxX);
    shark.group.position.copy(pathPos);

    // Scrubbing the page hard gives the shark a shove; its tailbeat and
    // amplitude are derived from real world speed inside shark.update().
    const scrubSpeed = Math.abs(scrollSmooth - prevSmooth) / Math.max(dt, 1e-4);
    if (scrubSpeed > 0.8) shark.burst(dt * 0.7);

    // Haze and motes follow the water down.
    const waterDepth = oceanShader ? oceanShader.depth : 0;
    if (scene.fog) {
      (scene.fog as THREE.Fog).color.copy(FOG_SURFACE).lerp(FOG_ABYSS, waterDepth);
    }
    moteColor.copy(MOTE_SURFACE).lerp(MOTE_ABYSS, waterDepth);
    sharkBase.copy(SHARK_BASE_SURFACE).lerp(SHARK_BASE_ABYSS, waterDepth);
    sharkGlow.copy(SHARK_GLOW_SURFACE).lerp(SHARK_GLOW_ABYSS, waterDepth);
    ambient.color.copy(AMBIENT_SURFACE).lerp(AMBIENT_ABYSS, waterDepth);
    key.color.copy(KEY_SURFACE).lerp(KEY_ABYSS, waterDepth);

    shark.steer(pathTangent, dt);
    shark.update(elapsed, dt);
    (motes.userData.update as (e: number) => void)(elapsed);
    codeFragments.update(elapsed);
  });
  depthScene.start();

  // Hero reveal
  function playHeroReveal() {
    if (token !== initToken) return;
    if (prefersReducedMotion()) {
      gsap.set("#home-hero [data-reveal-hero]", { opacity: 1, y: 0 });
      return;
    }

    gsap.set(revealState, { scale: 0.6 });
    gsap.set(shark.material.uniforms.u_reveal, { value: 0.06 });
    gsap.set(scene.fog, { near: 1, far: 5.5 });
    gsap.set(ambient, { intensity: 0.12 });
    gsap.set(key, { intensity: 0 });
    gsap.set(camera.position, { z: 10.6 });
    gsap.set("#home-hero [data-reveal-hero]", { opacity: 0, y: 18 });

    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.to(lightShaft.material, { opacity: 0.85, duration: 1.3, ease: "power2.inOut" }, 0.15)
      .to(ambient, { intensity: 0.35, duration: 1.6 }, 0.2)
      .to(key, { intensity: 0.6, duration: 1.6 }, 0.3)
      .to(scene.fog, { near: REST_FOG.near, far: REST_FOG.far, duration: 1.8, ease: "power2.inOut" }, 0.2)
      // Entry glide
      .to(revealOffset, { x: 0, y: 0, z: 0, duration: 2.2, ease: "power3.out" }, 0.1)
      .to(revealState, { scale: 1, duration: 2, ease: "power3.out" }, 0.1)
      .to(shark.material.uniforms.u_reveal, { value: 1, duration: 1.7, ease: "power2.in" }, 0.2)
      .to(camera.position, { z: 9, duration: 2, ease: "power2.inOut" }, 0.1)
      .to(lightShaft.material, { opacity: 0, duration: 1, ease: "power1.in" }, 1.9)
      .to(
        "#home-hero [data-reveal-hero]",
        { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: "power2.out" },
        1.7,
      );
  }

  const preloaderDone = new Promise<void>((resolve) => {
    if (!document.getElementById("preloader")) return resolve();
    document.addEventListener("codefest:preloader-done", () => resolve(), { once: true });
  });
  // Reveal readiness
  const safety = new Promise<void>((resolve) => setTimeout(resolve, 6000));
  Promise.race([Promise.all([preloaderDone, shark.ready]), safety]).then(playHeroReveal);

  // Scroll descent
  const descentTl = gsap.timeline({
    scrollTrigger: {
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
    },
  });
  descentTl
    .to(camera.position, { y: -2.6, z: 6.2, ease: "none", duration: 1 }, 0)
    .to(scene.fog, { near: 2, far: 10, ease: "none", duration: 1 }, 0)
    .to(oceanShader, { intensity: 0.85, ease: "none", duration: 1 }, 0)
    // Sunlit shallows -> open water, across the whole page.
    .to(oceanShader, { depth: 1, ease: "none", duration: 2 }, 0)
    .to(camera.position, { y: 0.4, z: 9, ease: "none", duration: 1 }, 1)
    .to(scene.fog, { near: REST_FOG.near, far: REST_FOG.far, ease: "none", duration: 1 }, 1)
    .to(oceanShader, { intensity: 0.5, ease: "none", duration: 1 }, 1);
  if (descentTl.scrollTrigger) scrollTriggers.push(descentTl.scrollTrigger);
}

// Pointer tracking. The shark reads this as a soft attraction, borrowing the
// spring-follow idea from 21st.dev's "Follow pointer" motion example.
let pointerHandler: ((e: PointerEvent) => void) | null = null;

function attachPointer(shark: Shark) {
  detachPointer();
  pointerHandler = (event: PointerEvent) => {
    shark.setPointer(
      (event.clientX / window.innerWidth) * 2 - 1,
      -((event.clientY / window.innerHeight) * 2 - 1),
    );
  };
  window.addEventListener("pointermove", pointerHandler, { passive: true });
}

function detachPointer() {
  if (!pointerHandler) return;
  window.removeEventListener("pointermove", pointerHandler);
  pointerHandler = null;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

document.addEventListener("astro:page-load", init);
document.addEventListener("astro:before-swap", teardown);
