import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Shark model
const MODEL_URL = "/models/shark.glb";

// Canonical model bounds, written by scripts/stl-to-glb.mjs alongside the
// GLB as public/models/shark.json. Nose at +Z, tail at -Z, unit length.
const NOSE_Z = 0.5;
const TAIL_Z = -0.5;
const HALF_WIDTH = 0.2744;

// Strouhal number. Real cruising fish hold tailbeat frequency x amplitude /
// speed in a tight band around 0.3, so beat rate follows swimming speed
// instead of being an arbitrary constant. This is the single detail that
// makes the animation read as a swimming animal rather than a looping GIF.
const STROUHAL = 0.3;
const BEAT_MIN_HZ = 0.5;
const BEAT_MAX_HZ = 2.2;
// Ceiling on how fast the beat rate itself may change, in Hz per second.
// Without this a hard scroll flick ramps the tail faster than a real animal
// could ever accelerate, which reads as a twitch however smooth the phase is.
const BEAT_SLEW_HZ_PER_S = 0.7;
// Speed is clamped before it reaches the Strouhal relation so that flinging
// the scrollbar cannot drive the tail past a plausible cruising gait.
const MAX_TRACKED_SPEED = 3.2;

// Heading is a damped spring. Damping sits just above critical
// (2 * sqrt(stiffness) = 6.32) so the body carries its mass through a turn
// and settles without ever oscillating.
const TURN_STIFFNESS = 10;
const TURN_DAMPING = 7.0;
// Hard ceiling on how far off horizontal the body may ever tilt, in radians.
const MAX_PITCH = 0.16;

const FRESNEL_FRAG = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  uniform vec3 u_baseColor;
  uniform vec3 u_glowColor;
  uniform float u_time;
  uniform float u_reveal;
  uniform float u_effort;

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.4);
    float pulse = 0.88 + 0.12 * sin(u_time * 1.4);
    // Working harder lights the rim up a little, like strain showing.
    float rim = clamp(fresnel * pulse, 0.0, 1.0) * (1.0 + u_effort * 0.35);
    vec3 color = mix(u_baseColor, u_glowColor, clamp(rim, 0.0, 1.0));
    float brightness = mix(0.05, 1.0, clamp(u_reveal, 0.0, 1.0));
    gl_FragColor = vec4(color * brightness, 1.0);
  }
`;

// Swim deformation
const SWIM_VERT = `
  // u_phase is integrated on the CPU. Deriving it here as time * frequency
  // would make every change of beat rate jump the phase by elapsed * delta,
  // which is what used to snap the tail when scrolling quickly.
  uniform float u_phase;
  uniform float u_swimAmount;
  uniform float u_waveFreq;
  uniform float u_bend;
  uniform float u_finFlap;
  uniform float u_noseZ;
  uniform float u_tailZ;
  uniform float u_halfWidth;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 pos = position;

    // s runs 0 at the nose to 1 at the tail tip.
    float s = clamp((u_noseZ - pos.z) / (u_noseZ - u_tailZ), 0.0, 1.0);

    // Sub-carangiform envelope: the front fifth of the body barely moves and
    // amplitude then grows quadratically toward the tail. The small floor at
    // the nose is head recoil, which the travelling wave already puts out of
    // phase with the tail.
    float ramp = smoothstep(0.12, 1.0, s);
    float env = 0.04 + 0.96 * ramp * ramp;

    // Minus on the phase term sends the wave nose -> tail.
    float phase = s * u_waveFreq - u_phase;
    float wave = sin(phase) * u_swimAmount * env;

    // A turn bends the whole body into an arc with the tail swinging
    // outboard, so the shark leans into the corner instead of sliding.
    float bend = u_bend * ramp * ramp;

    pos.x += wave + bend;

    // This sculpt is a flattened shark, so the pectoral tips flap slightly
    // out of phase with the spine the way a benthic shark's do. Span is
    // measured from the deformed x, so the thin tail blade never flaps.
    float span = clamp(abs(pos.x) / u_halfWidth, 0.0, 1.0);
    pos.y += sin(phase - 1.2) * u_finFlap * span * span;

    // Rebuild the normal from the analytic slope of the lateral wave.
    float dWaveDz = -cos(phase) * u_waveFreq * u_swimAmount * env;
    vec3 n = normalize(normal + vec3(-dWaveDz, 0.0, 0.0) * 0.6);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    vNormal = normalMatrix * n;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export interface Shark {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  ready: Promise<void>;
  loaded: boolean;

  /** Base pitch of the swimming pose, in radians. 0 swims level. */
  headUpPitch: number;
  update(elapsed: number, dt: number): void;
  steer(direction: THREE.Vector3, dt: number): void;
  /** Pointer position in normalised device coords, both axes -1..1. */
  setPointer(x: number, y: number): void;
  /** Kick a burst of thrust, e.g. when the viewer disturbs the water. */
  burst(strength?: number): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();

export function createShark(): Shark {
  const group = new THREE.Group();
  // Steering groups
  const steerGroup = new THREE.Group();
  group.add(steerGroup);
  // Orientation fix: the model noses along +Z, while Matrix4.lookAt puts
  // local -Z down the heading, so the body is spun to face the way it swims.
  const bodyGroup = new THREE.Group();
  bodyGroup.rotation.y = Math.PI;
  steerGroup.add(bodyGroup);

  const material = new THREE.ShaderMaterial({
    vertexShader: SWIM_VERT,
    fragmentShader: FRESNEL_FRAG,
    uniforms: {
      u_time: { value: 0 },
      u_baseColor: { value: new THREE.Color("#07222a") },
      u_glowColor: { value: new THREE.Color("#86d2d8") },
      u_reveal: { value: 1 },
      u_effort: { value: 0 },
      u_phase: { value: 0 },
      u_swimAmount: { value: 0.055 },
      u_waveFreq: { value: 7.0 },
      u_bend: { value: 0 },
      u_finFlap: { value: 0 },
      u_noseZ: { value: NOSE_Z },
      u_tailZ: { value: TAIL_Z },
      u_halfWidth: { value: HALF_WIDTH },
    },
  });

  const shark: Shark = {
    group,
    material,
    loaded: false,
    ready: Promise.resolve(),
    headUpPitch: 0,
    update() {},
    steer() {},
    setPointer() {},
    burst() {},
  };

  shark.ready = new Promise<void>((resolve) => {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        let mesh: THREE.Mesh | null = null;
        gltf.scene.traverse((obj) => {
          if (!mesh && (obj as THREE.Mesh).isMesh) mesh = obj as THREE.Mesh;
        });
        if (mesh) {
          const found = mesh as THREE.Mesh;
          gltf.scene.updateWorldMatrix(true, true);
          const geometry = found.geometry.clone();
          geometry.applyMatrix4(found.matrixWorld);
          geometry.computeBoundingBox();
          bodyGroup.add(new THREE.Mesh(geometry, material));
          shark.loaded = true;
        }
        resolve();
      },
      undefined,
      () => resolve(),
    );
  });

  // Steering state
  const heading = new THREE.Vector3(0, 0, -1);
  const lookMatrix = new THREE.Matrix4();
  const targetQuat = new THREE.Quaternion();
  const bankQuat = new THREE.Quaternion();
  const forwardAxis = new THREE.Vector3(0, 0, -1);
  const horiz = new THREE.Vector3();
  // yaw starts at PI so the initial heading is (0, 0, -1).
  let yaw = Math.PI;
  let yawVel = 0;
  let pitch = 0;
  let bank = 0;
  let turnRate = 0;

  // Body state
  const prevPos = new THREE.Vector3();
  let hasPrevPos = false;
  let speed = 0;
  let climb = 0;
  let effort = 0;
  let burstEnergy = 0;
  let beatHz = BEAT_MIN_HZ;
  let amount = 0.05;
  let swimPhase = 0;
  let bendSmooth = 0;
  const pointer = { x: 0, y: 0 };
  const pointerSmooth = { x: 0, y: 0 };

  shark.setPointer = (x: number, y: number) => {
    pointer.x = THREE.MathUtils.clamp(x, -1, 1);
    pointer.y = THREE.MathUtils.clamp(y, -1, 1);
  };

  shark.burst = (strength = 1) => {
    burstEnergy = Math.min(burstEnergy + strength, 1.6);
  };

  shark.steer = (direction: THREE.Vector3, dt: number) => {
    if (direction.lengthSq() < 1e-8) return;

    horiz.set(direction.x, 0, direction.z);
    if (horiz.lengthSq() < 1e-8) horiz.set(0, 0, -1);
    horiz.normalize();

    // Yaw and pitch are sprung as separate angles rather than as one heading
    // vector. Springing the vector and renormalising it lets pitch spike
    // whenever the horizontal components pass near zero mid-turn, which is
    // precisely what a flung scrollbar does to the path tangent.
    const desiredYaw = Math.atan2(horiz.x, horiz.z);
    let yawError = desiredYaw - yaw;
    if (yawError > Math.PI) yawError -= Math.PI * 2;
    if (yawError < -Math.PI) yawError += Math.PI * 2;
    yawVel += (yawError * TURN_STIFFNESS - yawVel * TURN_DAMPING) * dt;
    yaw += yawVel * dt;

    // Level flight: climb and pointer tilt the nose only a few degrees, so the
    // body always reads as a near-horizontal line across the page.
    const desiredPitch = THREE.MathUtils.clamp(
      shark.headUpPitch + climb * 0.1 + pointerSmooth.y * 0.05,
      -MAX_PITCH,
      MAX_PITCH,
    );
    pitch += (desiredPitch - pitch) * (1 - Math.exp(-dt * 1.6));

    const aim = yaw + pointerSmooth.x * 0.06;
    const cp = Math.cos(pitch);
    heading.set(Math.sin(aim) * cp, Math.sin(pitch), Math.cos(aim) * cp);

    lookMatrix.lookAt(ORIGIN, heading, UP);
    targetQuat.setFromRotationMatrix(lookMatrix);

    // Bank comes straight off the sprung yaw velocity, which is already
    // smooth, instead of off a differenced angle that spikes when scrubbing.
    turnRate += (yawVel - turnRate) * (1 - Math.exp(-dt * 4));
    const targetBank = THREE.MathUtils.clamp(turnRate * 0.32, -0.45, 0.45);
    bank += (targetBank - bank) * (1 - Math.exp(-dt * 2.4));

    bankQuat.setFromAxisAngle(forwardAxis, bank);
    targetQuat.multiply(bankQuat);
    steerGroup.quaternion.copy(targetQuat);
  };

  shark.update = (elapsed: number, dt: number) => {
    const step = Math.max(dt, 1e-4);
    material.uniforms.u_time.value = elapsed;

    // Measure real world-space speed from the path rather than trusting a
    // scroll delta, so drift, reveal glide and scrubbing all count.
    if (hasPrevPos) {
      const instant = Math.min(prevPos.distanceTo(group.position) / step, MAX_TRACKED_SPEED);
      const vy = (group.position.y - prevPos.y) / step;
      speed += (instant - speed) * (1 - Math.exp(-step * 2.2));
      climb += (THREE.MathUtils.clamp(vy * 0.4, -1, 1) - climb) * (1 - Math.exp(-step * 2));
    }
    prevPos.copy(group.position);
    hasPrevPos = true;

    // Pointer follows with a soft spring so it never snaps.
    const pk = 1 - Math.exp(-step * 3.5);
    pointerSmooth.x += (pointer.x - pointerSmooth.x) * pk;
    pointerSmooth.y += (pointer.y - pointerSmooth.y) * pk;

    burstEnergy *= Math.exp(-step * 1.1);

    // Tail amplitude in world units, which is what the Strouhal relation
    // needs. The group is scaled responsively, so read it every frame.
    const scale = group.scale.x || 1;
    const amountTarget = 0.05 + burstEnergy * 0.018;
    amount += (amountTarget - amount) * (1 - Math.exp(-step * 2));
    const peakToPeak = 2 * amount * scale;

    const drive = speed + burstEnergy * 1.2;
    const beatTarget = THREE.MathUtils.clamp(
      (STROUHAL * drive) / Math.max(peakToPeak, 1e-3),
      BEAT_MIN_HZ,
      BEAT_MAX_HZ,
    );

    // Ease toward the target, then hard-limit the remaining rate of change so
    // the gait can never step faster than a real animal could change it.
    const eased = beatHz + (beatTarget - beatHz) * (1 - Math.exp(-step * 1.8));
    const slew = BEAT_SLEW_HZ_PER_S * step;
    beatHz += THREE.MathUtils.clamp(eased - beatHz, -slew, slew);

    // Integrate the phase. This is the only place the beat rate is consumed,
    // so a change in rate bends the wave rather than displacing it.
    swimPhase = (swimPhase + beatHz * Math.PI * 2 * step) % (Math.PI * 2);
    material.uniforms.u_phase.value = swimPhase;
    material.uniforms.u_swimAmount.value = amount;

    // Effort reads off how hard the tail is working, and drives the rim glow.
    const target = THREE.MathUtils.clamp(
      (beatHz - BEAT_MIN_HZ) / (BEAT_MAX_HZ - BEAT_MIN_HZ),
      0,
      1,
    );
    effort += (target - effort) * (1 - Math.exp(-step * 1.6));
    material.uniforms.u_effort.value = effort;

    // Turning curls the body; the tail trails the head through the corner.
    const bendTarget = THREE.MathUtils.clamp(-turnRate * 0.035, -0.06, 0.06);
    bendSmooth += (bendTarget - bendSmooth) * (1 - Math.exp(-step * 2.6));
    material.uniforms.u_bend.value = bendSmooth;

    // Pectoral flap eases off as the shark speeds up and tucks its fins in.
    material.uniforms.u_finFlap.value = 0.012 * (1 - effort * 0.6);

    // Idle sway, faded out under effort so it never fights the swim cycle.
    const calm = 1 - effort * 0.75;
    bodyGroup.rotation.z = Math.sin(elapsed * 0.55) * 0.07 * calm;
    bodyGroup.rotation.x = Math.sin(elapsed * 0.42 + 1.1) * 0.045 * calm;
    bodyGroup.position.y = Math.sin(elapsed * 0.7) * 0.035 * calm;
  };

  return shark;
}
