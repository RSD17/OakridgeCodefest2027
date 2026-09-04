import * as THREE from "three";

// Ambient particles

const MOTE_VERT = `
  attribute float aSeed;
  attribute float aSpeed;
  uniform float u_time;
  uniform float u_pixelRatio;
  varying float vTwinkle;

  void main() {
    vec3 pos = position;
    pos.y += sin(u_time * aSpeed + aSeed * 6.2831) * 0.6;
    pos.x += cos(u_time * aSpeed * 0.7 + aSeed * 6.2831) * 0.4;
    vTwinkle = 0.55 + 0.45 * sin(u_time * (aSpeed + 0.6) + aSeed * 10.0);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (2.0 + aSeed * 2.5) * u_pixelRatio * (60.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const MOTE_FRAG = `
  uniform vec3 u_color;
  varying float vTwinkle;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.0, d) * vTwinkle;
    gl_FragColor = vec4(u_color, alpha * 0.85);
  }
`;

export function createMoteField(count = 220): THREE.Points {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 14;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 16;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
    seeds[i] = Math.random();
    speeds[i] = 0.15 + Math.random() * 0.35;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: {
      u_time: { value: 0 },
      u_pixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.75) },
      u_color: { value: new THREE.Color("#8fdde2") },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.userData.update = (elapsed: number) => {
    material.uniforms.u_time.value = elapsed;
  };
  return points;
}

const SNIPPETS = [
  "if (idea.isReal())",
  "build();",
  "24:00:00",
  'git commit -m "Descent Completed."',
  "// v10",
  "return impact;",
  "while (curious) {}",
  "await ship();",
];

function makeCodeTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "600 40px 'JetBrains Mono', monospace";
  ctx.fillStyle = "rgba(116, 192, 201, 0.85)";
  ctx.shadowColor = "rgba(116, 192, 201, 0.8)";
  ctx.shadowBlur = 18;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 16, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export interface CodeFragments {
  group: THREE.Group;
  update(elapsed: number): void;
}

export function createCodeFragments(): CodeFragments {
  const group = new THREE.Group();
  const items: { mesh: THREE.Mesh; seed: number; speed: number; baseY: number }[] = [];

  SNIPPETS.forEach((text, i) => {
    const texture = makeCodeTexture(text);
    const aspect = 512 / 128;
    const height = 0.42;
    const geometry = new THREE.PlaneGeometry(height * aspect, height);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const seed = Math.random() * Math.PI * 2;
    const baseY = (Math.random() - 0.5) * 12;
    mesh.position.set(
      (Math.random() - 0.5) * 9 + (i % 2 === 0 ? 3 : -3),
      baseY,
      (Math.random() - 0.5) * 4 - 1,
    );
    mesh.rotation.z = (Math.random() - 0.5) * 0.3;
    group.add(mesh);
    items.push({ mesh, seed, speed: 0.08 + Math.random() * 0.1, baseY });
  });

  function update(elapsed: number) {
    for (const item of items) {
      item.mesh.position.y = item.baseY + Math.sin(elapsed * item.speed + item.seed) * 1.4;
      item.mesh.position.x += Math.sin(elapsed * item.speed * 0.5 + item.seed) * 0.0015;
      item.mesh.rotation.z = Math.sin(elapsed * 0.15 + item.seed) * 0.08;
    }
  }

  return { group, update };
}
