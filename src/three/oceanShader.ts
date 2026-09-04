// Ocean shader

const VERT = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[4];
uniform vec4 u_scene;      // resolution.xy, time, colour count
uniform vec4 u_shape;      // scale, intensity, unused, warp
uniform vec4 u_finish;     // vignette, grain, unused, unused
uniform vec4 u_splash[8];  // xy = NDC position, z = start time, w = strength

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_warp u_shape.w
#define u_depth u_shape.z
#define u_vignette u_finish.x
#define u_grain u_finish.y
#define u_sun u_finish.z

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 palette(float x) {
  float f = clamp(x, 0.0, 1.0) * 3.0;
  vec3 col = u_colors[0];
  for (int i = 0; i < 3; i++) {
    col = mix(col, u_colors[i + 1], smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}

// Sunlight breaking through the surface. Beams are summed sines in a
// coordinate that converges toward a point above the frame, so they splay
// downward the way real shafts do. Technique referenced from 21st.dev's
// "God Rays" shader by paper-design (Paper Shaders, Apache-2.0).
float sunShafts(vec2 uv, float t) {
  float conv = mix(0.26, 1.0, clamp(1.0 - uv.y, 0.0, 1.0));
  float x = (uv.x - 0.5) / max(conv, 0.08);

  // The surface overhead is moving, so the shafts wander with it instead of
  // sliding at a constant rate. Drifting the coordinate itself bends each
  // beam along its length rather than translating the whole set rigidly.
  x += (fbm(vec2(uv.y * 1.6, t * 0.05)) - 0.5) * 0.7;

  // Three incommensurate rates, so the pattern never visibly repeats.
  float beams =
      sin(x * 5.0 + t * 0.13) * 0.55
    + sin(x * 9.3 - t * 0.09) * 0.30
    + sin(x * 17.1 + t * 0.06) * 0.15;
  beams = beams * 0.5 + 0.5;
  beams = pow(clamp(beams, 0.0, 1.0), 4.0);

  // Swell passing overhead lets the light through unevenly.
  float swell = 0.82 + 0.18 * sin(t * 0.19 + uv.x * 1.7)
                     * cos(t * 0.11 - uv.y * 0.9);
  beams *= swell;

  // Brightest just under the surface, dying off further down the frame.
  float falloff = pow(clamp(uv.y, 0.0, 1.0), 1.6);
  // Soften the very top so the shafts emerge instead of being cut off.
  falloff *= smoothstep(1.0, 0.86, uv.y) * 0.6 + 0.4;
  return beams * falloff;
}

vec3 shade(vec2 uv, vec2 p, float t) {
  float y = uv.y
    + sin(uv.x * (3.0 + u_intensity * 9.0) + t * 0.8) * 0.08
    + (fbm(p * 2.0 + t * 0.1) - 0.5) * u_intensity * 0.6;
  return palette(y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 screenUv = uv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  vec3 splashGlow = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float st = u_splash[i].z;
    if (st < 0.0) continue;
    float strength = u_splash[i].w;
    bool isTrail = strength < 0.7;
    float age = u_time - st;
    float maxAge = isTrail ? 0.6 : 2.0;
    if (age < 0.0 || age > maxAge) continue;

    vec2 splashPos = (0.5 * u_splash[i].xy * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    vec2 delta = p - splashPos;
    float dist = length(delta);
    vec2 dir = delta / max(dist, 0.0001);

    float ageFade = exp(-age * (isTrail ? 4.0 : 1.6));
    float front = age * (isTrail ? 0.3 : 1.0);
    float d = dist - front;
    float envelope = exp(-d * d * (isTrail ? 34.0 : 24.0)) * ageFade;
    float wave = cos(d * 42.0);
    float ring = envelope * wave;
    p += dir * ring * 0.012 * strength;
    float crest = pow(max(ring, 0.0), 2.2);
    float crestMult = isTrail ? 0.22 : 0.35;
    splashGlow += vec3(0.80, 0.93, 1.0) * crest * crestMult;
  }

  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
  p *= u_scale;

  if (u_warp > 0.0) {
    p += u_warp * (vec2(fbm(p * 2.4), fbm(p * 2.4 + vec2(5.2, 1.3))) - 0.5);
  }

  vec3 col = shade(uv, p, u_time);
  col += splashGlow;

  // Shafts only exist near the surface; u_sun is faded out on descent.
  if (u_sun > 0.001) {
    float shafts = sunShafts(screenUv, u_time);
    // Break the beams up with the same noise field that drives the water.
    shafts *= 0.62 + 0.38 * fbm(vec2(screenUv.x * 3.0, u_time * 0.05));
    col += vec3(0.45, 0.82, 0.85) * shafts * u_sun;
  }

  if (u_vignette > 0.0001) {
    // The deeper the descent, the further the edges close in.
    float vd = length(screenUv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * (1.0 + u_depth * 0.55) * smoothstep(0.35, 1.0, vd);
  }
  if (u_grain > 0.0001) {
    col += (grainHash(gl_FragCoord.xy) - 0.5) * u_grain;
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// Depth Charge palette: abyss -> deep navy -> ocean blue -> lit surface.
// Navy ramp follows 21st.dev's "Harbor Blue" theme (slate-900 family), which
// carries the premium weight a near-black blue was losing.
// Weighted toward the dark end of the ramp, so the page reads as deep water
// rather than a shallow lagoon.
const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

// Sunlit shallows, referenced from 21st.dev's "Oceanic Depths" shader by
// serafimcloud. Turquoise rather than blue because water absorbs red
// wavelengths first: shallow sunlit water really does read aquamarine, and
// only deep open water goes pure blue. So the descent to PALETTE_ABYSS is
// the actual physical progression, not just a stylistic one.
// Luminance per stop is matched to the abyss ramp, and the light is kept in
// the top third, so the hero headline keeps its contrast at every depth.
const PALETTE_SURFACE = [0x031117, 0x061f27, 0x0f5560, 0x74d2d8].map(rgb);

// Open water far below the light. Even the brightest stop here is darker
// than the shallows' darkest, so the descent reads unmistakably.
const PALETTE_ABYSS = [0x03060c, 0x070f1e, 0x0f172a, 0x1e3f6b].map(rgb);

export interface OceanShaderOptions {
  cursorEnabled?: boolean;
  intensity?: number;
}

export class OceanShader {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private disposed = false;
  private start = performance.now();
  private bounds: DOMRect;
  private resizeObserver: ResizeObserver;
  private cursorEnabled: boolean;
  // Wave intensity
  intensity: number;
  /** 0 at the sunlit surface, 1 in deep water. Driven by page scroll. */
  depth = 0;
  private paletteData = new Float32Array(12);
  private static readonly SPLASH_SLOTS = 8;
  // Cursor-trail threshold
  private static readonly TRAIL_MIN_DIST = 11;
  private splashes: { x: number; y: number; time: number; strength: number }[] = Array.from(
    { length: OceanShader.SPLASH_SLOTS },
    () => ({ x: 0, y: 0, time: -999, strength: 1 }),
  );
  private nextSplashSlot = 0;
  private lastTrailX = 0;
  private lastTrailY = 0;
  private hasTrailOrigin = false;

  constructor(
    private canvas: HTMLCanvasElement,
    options: OceanShaderOptions = {},
  ) {
    this.cursorEnabled = options.cursorEnabled ?? true;
    this.intensity = options.intensity ?? 0.55;
    this.bounds = canvas.getBoundingClientRect();

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) {
      this.resizeObserver = new ResizeObserver(() => {});
      return;
    }
    this.gl = gl;
    this.init();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);

    if (this.cursorEnabled) {
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
      window.addEventListener("pointerleave", this.onPointerLeave);
    }

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.requestRender();
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === "visible") this.requestRender();
  };

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  }

  private init() {
    const gl = this.gl!;
    const program = gl.createProgram()!;
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(program);
    this.program = program;

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.buffer = buf;

    this.uni = {
      colors: gl.getUniformLocation(program, "u_colors"),
      scene: gl.getUniformLocation(program, "u_scene"),
      shape: gl.getUniformLocation(program, "u_shape"),
      finish: gl.getUniformLocation(program, "u_finish"),
      splash: gl.getUniformLocation(program, "u_splash"),
    };

    this.uploadPalette();
  }

  /** Blend the two palettes by depth and hand the result to the shader. */
  private uploadPalette() {
    const gl = this.gl;
    if (!gl) return;
    const d = Math.min(Math.max(this.depth, 0), 1);
    for (let i = 0; i < 4; i++) {
      for (let c = 0; c < 3; c++) {
        this.paletteData[i * 3 + c] =
          PALETTE_SURFACE[i][c] + (PALETTE_ABYSS[i][c] - PALETTE_SURFACE[i][c]) * d;
      }
    }
    gl.uniform3fv(this.uni.colors, this.paletteData);
  }

  private onPointerMove = (e: PointerEvent) => {
    this.bounds = this.canvas.getBoundingClientRect();
    const inside =
      e.clientX >= this.bounds.left &&
      e.clientX <= this.bounds.right &&
      e.clientY >= this.bounds.top &&
      e.clientY <= this.bounds.bottom;
    if (!inside) {
      this.hasTrailOrigin = false;
      return;
    }
    if (!this.hasTrailOrigin) {
      this.lastTrailX = e.clientX;
      this.lastTrailY = e.clientY;
      this.hasTrailOrigin = true;
    } else {
      const dx = e.clientX - this.lastTrailX;
      const dy = e.clientY - this.lastTrailY;
      if (dx * dx + dy * dy > OceanShader.TRAIL_MIN_DIST * OceanShader.TRAIL_MIN_DIST) {
        this.addSplash(e.clientX, e.clientY, 0.4);
        this.lastTrailX = e.clientX;
        this.lastTrailY = e.clientY;
      }
    }
  };

  private onPointerLeave = () => {
    this.hasTrailOrigin = false;
  };

  // Water splash
  addSplash(clientX: number, clientY: number, strength = 1) {
    if (!this.gl) return;
    this.bounds = this.canvas.getBoundingClientRect();
    const x = ((clientX - this.bounds.left) / this.bounds.width) * 2 - 1;
    const y = -(((clientY - this.bounds.top) / this.bounds.height) * 2 - 1);
    const time = (performance.now() - this.start) / 1000;
    this.splashes[this.nextSplashSlot] = { x, y, time, strength };
    this.nextSplashSlot = (this.nextSplashSlot + 1) % OceanShader.SPLASH_SLOTS;
    this.requestRender();
  }

  private handleResize() {
    if (!this.gl) return;
    this.bounds = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(this.bounds.width * dpr));
    const height = Math.max(1, Math.round(this.bounds.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    this.requestRender();
  }

  private requestRender() {
    if (!this.disposed && this.raf === 0 && document.visibilityState === "visible") {
      this.raf = requestAnimationFrame(this.render);
    }
  }

  private render = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.gl || document.visibilityState !== "visible") return;

    this.gl.uniform4f(
      this.uni.scene,
      this.canvas.width,
      this.canvas.height,
      (now - this.start) / 1000,
      4,
    );
    const depth = Math.min(Math.max(this.depth, 0), 1);
    this.gl.uniform4f(this.uni.shape, 1.8, this.intensity, depth, 0.25);
    // Shafts are gone well before the bottom of the page.
    const sun = 1 - Math.min(depth / 0.55, 1);
    this.gl.uniform4f(this.uni.finish, 0.35, 0.045, sun * sun, 0);
    this.uploadPalette();

    const splashData = new Float32Array(OceanShader.SPLASH_SLOTS * 4);
    for (let i = 0; i < OceanShader.SPLASH_SLOTS; i++) {
      const s = this.splashes[i];
      splashData[i * 4] = s.x;
      splashData[i * 4 + 1] = s.y;
      splashData[i * 4 + 2] = s.time;
      splashData[i * 4 + 3] = s.strength;
    }
    this.gl.uniform4fv(this.uni.splash, splashData);

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);

    this.requestRender();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerleave", this.onPointerLeave);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    if (this.gl) {
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.program) this.gl.deleteProgram(this.program);
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
}
