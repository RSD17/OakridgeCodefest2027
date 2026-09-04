import * as THREE from "three";

// Light shaft
export function createLightShaft(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "rgba(219,234,254,0.95)");
  gradient.addColorStop(0.35, "rgba(116, 192, 201,0.5)");
  gradient.addColorStop(1, "rgba(116, 192, 201,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 256);
  const texture = new THREE.CanvasTexture(canvas);

  const geometry = new THREE.PlaneGeometry(2.6, 11);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.z = 0.22;
  return mesh;
}
