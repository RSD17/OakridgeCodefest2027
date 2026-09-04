#!/usr/bin/env node
/**
 * STL -> GLB pipeline for the Codefest shark.
 *
 * The raw sculpt in 3d_models/ is print-oriented: arbitrary axes, arbitrary
 * scale, no index buffer, three duplicated vertices per triangle. The web
 * scene wants the opposite of all of that, so this script normalises the
 * model into the canonical pose src/three/shark.ts assumes:
 *
 *   +Z = nose        +Y = dorsal (up)        X = width
 *   centred on the origin, total length 1.0
 *
 * Orientation is derived from the mesh itself rather than hard-coded, so a
 * re-export of the sculpt from any DCC tool still lands the same way up.
 *
 * Usage:
 *   node scripts/stl-to-glb.mjs --in=3d_models/ocf3dshark-flat.stl \
 *                               --out=public/models/shark.glb
 *
 * Flags:
 *   --shading=auto|flat|smooth   normal generation (default auto)
 *   --angle=<deg>                crease angle for --shading=auto (default 40)
 *   --simplify=<0..1>            triangle budget as a ratio (default 1 = off)
 *   --error=<0..1>               simplification error tolerance (default 0.005)
 *   --no-quantize                skip KHR_mesh_quantization
 */

import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, simplify } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    in: "3d_models/ocf3dshark-flat.stl",
    out: "public/models/shark.glb",
    shading: "auto",
    angle: 40,
    simplify: 1,
    error: 0.005,
    quantize: true,
  };
  for (const arg of argv) {
    const [rawKey, rawValue] = arg.replace(/^--/, "").split("=");
    const value = rawValue ?? "true";
    switch (rawKey) {
      case "in":
      case "out":
      case "shading":
        opts[rawKey] = value;
        break;
      case "angle":
      case "simplify":
      case "error":
        opts[rawKey] = Number(value);
        break;
      case "no-quantize":
        opts.quantize = false;
        break;
      default:
        throw new Error(`Unknown flag: --${rawKey}`);
    }
  }
  if (!["auto", "flat", "smooth"].includes(opts.shading)) {
    throw new Error(`--shading must be auto, flat or smooth (got "${opts.shading}")`);
  }
  if (!(opts.simplify > 0 && opts.simplify <= 1)) {
    throw new Error("--simplify must be in (0, 1]");
  }
  return opts;
}

// -------------------------------------------------------------- STL reading

/** True when the buffer's declared triangle count matches its byte length. */
function isBinarySTL(buf) {
  if (buf.length < 84) return false;
  const declared = buf.readUInt32LE(80);
  return buf.length === 84 + declared * 50;
}

function readBinarySTL(buf) {
  const count = buf.readUInt32LE(80);
  const positions = new Float32Array(count * 9);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < count; i++) {
    // 50 bytes per triangle: 12 normal, 36 vertices, 2 attribute bytes.
    const offset = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k++) {
      positions[i * 9 + k] = view.getFloat32(offset + k * 4, true);
    }
  }
  return positions;
}

function readASCIISTL(text) {
  const values = [];
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    values.push(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (values.length === 0 || values.length % 9 !== 0) {
    throw new Error("ASCII STL contained no complete triangles");
  }
  return Float32Array.from(values);
}

function readSTL(file) {
  const buf = fs.readFileSync(file);
  if (isBinarySTL(buf)) return readBinarySTL(buf);
  return readASCIISTL(buf.toString("utf8"));
}

// ------------------------------------------------------------- orientation

function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max, size: max.map((m, i) => m - min[i]) };
}

/**
 * Work out which axis runs nose-to-tail, which way is up, and which end is
 * the nose, using shark morphology: the caudal fin is a blade — very thin
 * across the body but tall top-to-bottom — so the end of the longest axis
 * with the most extreme cross-section aspect ratio is the tail, and the
 * dominant axis of that cross-section is "up".
 */
function detectOrientation(positions) {
  const { min, max, size } = boundsOf(positions);

  // Longest extent is the body axis.
  const lengthAxis = size.indexOf(Math.max(...size));
  const crossAxes = [0, 1, 2].filter((a) => a !== lengthAxis);

  // Measure the cross-section of the outer 12% at each end of the body axis.
  const span = size[lengthAxis];
  const band = span * 0.12;
  const lowLimit = min[lengthAxis] + band;
  const highLimit = max[lengthAxis] - band;

  const makeEnd = () => ({ min: [Infinity, Infinity], max: [-Infinity, -Infinity] });
  const low = makeEnd();
  const high = makeEnd();

  for (let i = 0; i < positions.length; i += 3) {
    const along = positions[i + lengthAxis];
    const end = along <= lowLimit ? low : along >= highLimit ? high : null;
    if (!end) continue;
    for (let c = 0; c < 2; c++) {
      const v = positions[i + crossAxes[c]];
      if (v < end.min[c]) end.min[c] = v;
      if (v > end.max[c]) end.max[c] = v;
    }
  }

  // Aspect ratio of each end's cross-section; the blade-like end is the tail.
  const aspect = (end) => {
    const a = Math.max(end.max[0] - end.min[0], 1e-6);
    const b = Math.max(end.max[1] - end.min[1], 1e-6);
    return Math.max(a / b, b / a);
  };
  const tailIsHigh = aspect(high) >= aspect(low);
  const tail = tailIsHigh ? high : low;

  // At the tail the taller cross axis is the dorsal/ventral (up) axis.
  const tailSpans = [tail.max[0] - tail.min[0], tail.max[1] - tail.min[1]];
  const upAxis = crossAxes[tailSpans[0] >= tailSpans[1] ? 0 : 1];
  const widthAxis = crossAxes.find((a) => a !== upAxis);

  return {
    lengthAxis,
    upAxis,
    widthAxis,
    // Nose sits at the opposite end from the tail.
    noseSign: tailIsHigh ? -1 : 1,
    bounds: { min, max, size },
    diagnostics: { tailAspect: aspect(tail), noseAspect: aspect(tailIsHigh ? low : high) },
  };
}

/**
 * Rewrite positions into the canonical pose: +Z nose, +Y up, centred, unit
 * length. Returns the transformed array (in place) plus the applied scale.
 */
function canonicalise(positions, orient) {
  const { lengthAxis, upAxis, widthAxis, noseSign, bounds } = orient;
  const centre = bounds.max.map((m, i) => (m + bounds.min[i]) / 2);
  const scale = 1 / bounds.size[lengthAxis];

  // Right-handed basis: X = width, Y = up, Z = nose. Flip width if the
  // rearranged axes would mirror the model.
  const handedness =
    permutationSign(widthAxis, upAxis, lengthAxis) * noseSign < 0 ? -1 : 1;

  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = (positions[i + widthAxis] - centre[widthAxis]) * scale * handedness;
    out[i + 1] = (positions[i + upAxis] - centre[upAxis]) * scale;
    out[i + 2] = (positions[i + lengthAxis] - centre[lengthAxis]) * scale * noseSign;
  }
  return { positions: out, scale, handedness };
}

/** Sign of the permutation taking (0,1,2) to (a,b,c). */
function permutationSign(a, b, c) {
  return Math.sign((b - a) * (c - a) * (c - b));
}

// ------------------------------------------------------- normals + welding

/**
 * Build an indexed mesh with crease-aware normals.
 *
 * Vertices that share a position are merged only when their faces lie within
 * `angleDeg` of each other, so curved flanks come out smooth while the hard
 * facets that give the "flat" sculpt its character keep their crisp edges.
 */
function buildIndexedMesh(positions, angleDeg) {
  const triCount = positions.length / 9;
  const faceNormals = new Float32Array(triCount * 3);
  const faceAreas = new Float32Array(triCount);

  for (let f = 0; f < triCount; f++) {
    const o = f * 9;
    const ax = positions[o + 3] - positions[o];
    const ay = positions[o + 4] - positions[o + 1];
    const az = positions[o + 5] - positions[o + 2];
    const bx = positions[o + 6] - positions[o];
    const by = positions[o + 7] - positions[o + 1];
    const bz = positions[o + 8] - positions[o + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    faceAreas[f] = len * 0.5;
    if (len > 1e-20) {
      faceNormals[f * 3] = nx / len;
      faceNormals[f * 3 + 1] = ny / len;
      faceNormals[f * 3 + 2] = nz / len;
    }
  }

  // Cluster corners by welded position. 1e-5 of unit length collapses the
  // duplicate corners STL emits without merging genuinely distinct detail.
  const GRID = 1e5;
  const clusters = new Map();
  for (let f = 0; f < triCount; f++) {
    for (let v = 0; v < 3; v++) {
      const o = f * 9 + v * 3;
      const key =
        `${Math.round(positions[o] * GRID)},` +
        `${Math.round(positions[o + 1] * GRID)},` +
        `${Math.round(positions[o + 2] * GRID)}`;
      let corners = clusters.get(key);
      if (!corners) clusters.set(key, (corners = []));
      corners.push(f * 3 + v);
    }
  }

  const cosLimit = Math.cos((angleDeg * Math.PI) / 180);
  const outPos = [];
  const outNrm = [];
  const indices = new Uint32Array(triCount * 3);

  for (const corners of clusters.values()) {
    // Split the corners at this position into smoothing groups.
    const groups = [];
    for (const corner of corners) {
      const f = (corner / 3) | 0;
      const nx = faceNormals[f * 3];
      const ny = faceNormals[f * 3 + 1];
      const nz = faceNormals[f * 3 + 2];
      let target = null;
      for (const g of groups) {
        const gl = Math.hypot(g.nx, g.ny, g.nz) || 1;
        if ((g.nx * nx + g.ny * ny + g.nz * nz) / gl >= cosLimit) {
          target = g;
          break;
        }
      }
      if (!target) {
        target = { nx: 0, ny: 0, nz: 0, corners: [] };
        groups.push(target);
      }
      // Area weighting keeps large faces from being outvoted by slivers.
      const w = faceAreas[f];
      target.nx += nx * w;
      target.ny += ny * w;
      target.nz += nz * w;
      target.corners.push(corner);
    }

    for (const g of groups) {
      const index = outPos.length / 3;
      const first = g.corners[0];
      const src = ((first / 3) | 0) * 9 + (first % 3) * 3;
      outPos.push(positions[src], positions[src + 1], positions[src + 2]);
      const len = Math.hypot(g.nx, g.ny, g.nz) || 1;
      outNrm.push(g.nx / len, g.ny / len, g.nz / len);
      for (const corner of g.corners) indices[corner] = index;
    }
  }

  return {
    position: Float32Array.from(outPos),
    normal: Float32Array.from(outNrm),
    indices,
    triCount,
  };
}

// ------------------------------------------------------------------ export

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inPath = path.resolve(opts.in);
  const outPath = path.resolve(opts.out);

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input STL not found: ${opts.in}`);
  }

  const stlBytes = fs.statSync(inPath).size;
  console.log(`Reading ${opts.in} (${(stlBytes / 1e6).toFixed(1)} MB)`);
  const raw = readSTL(inPath);
  console.log(`  ${raw.length / 9} triangles`);

  const orient = detectOrientation(raw);
  const AXIS = ["X", "Y", "Z"];
  console.log(
    `Orientation: length=${AXIS[orient.lengthAxis]}${orient.noseSign > 0 ? "+" : "-"} ` +
      `up=${AXIS[orient.upAxis]} width=${AXIS[orient.widthAxis]} ` +
      `(tail aspect ${orient.diagnostics.tailAspect.toFixed(1)} vs ` +
      `nose ${orient.diagnostics.noseAspect.toFixed(1)})`,
  );

  const { positions, scale } = canonicalise(raw, orient);
  console.log(`  scaled by ${scale.toExponential(3)} to unit length, centred`);

  const angle = opts.shading === "flat" ? 0 : opts.shading === "smooth" ? 180 : opts.angle;
  const mesh = buildIndexedMesh(positions, angle);
  const vertCount = mesh.position.length / 3;
  console.log(
    `Welded (${opts.shading}${opts.shading === "auto" ? ` ${angle}deg` : ""}): ` +
      `${mesh.triCount * 3} corners -> ${vertCount} vertices`,
  );

  // --- glTF assembly -------------------------------------------------------
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene("shark");

  const position = doc
    .createAccessor("POSITION")
    .setType("VEC3")
    .setArray(mesh.position);
  const normal = doc.createAccessor("NORMAL").setType("VEC3").setArray(mesh.normal);
  const index = doc
    .createAccessor("indices")
    .setType("SCALAR")
    .setArray(vertCount < 65536 ? Uint16Array.from(mesh.indices) : mesh.indices);

  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setAttribute("NORMAL", normal)
    .setIndices(index);

  const glMesh = doc.createMesh("shark").addPrimitive(prim);
  scene.addChild(doc.createNode("shark").setMesh(glMesh));

  const transforms = [dedup(), prune()];
  if (opts.simplify < 1) {
    await MeshoptSimplifier.ready;
    transforms.push(
      simplify({ simplifier: MeshoptSimplifier, ratio: opts.simplify, error: opts.error }),
    );
  }
  if (opts.quantize) {
    // Matches the precision the previous pipeline shipped: 16-bit positions
    // and normals, which the scene's fresnel shader is insensitive to.
    transforms.push(quantize({ quantizePosition: 16, quantizeNormal: 16 }));
  }
  await doc.transform(...transforms);

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await io.write(outPath, doc);

  // --- bounds sidecar ------------------------------------------------------
  // shark.ts drives its swim-wave taper from the model's real nose/tail Z, so
  // publish them rather than leaving the shader with stale constants.
  // Bounds come from the pre-quantisation floats, which are exact by
  // construction; counts come from the primitive as actually shipped.
  const final = boundsOf(mesh.position);
  const meta = {
    source: path.basename(inPath),
    generated: new Date().toISOString(),
    triangles: prim.getIndices().getCount() / 3,
    vertices: prim.getAttribute("POSITION").getCount(),
    noseZ: Number(final.max[2].toFixed(4)),
    tailZ: Number(final.min[2].toFixed(4)),
    halfWidth: Number((final.size[0] / 2).toFixed(4)),
    halfHeight: Number((final.size[1] / 2).toFixed(4)),
  };
  const metaPath = outPath.replace(/\.glb$/, ".json");
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  const outBytes = fs.statSync(outPath).size;
  console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${(outBytes / 1024).toFixed(0)} KB)`);
  console.log(`Wrote ${path.relative(process.cwd(), metaPath)}`);
  console.log(`  noseZ=${meta.noseZ} tailZ=${meta.tailZ} halfWidth=${meta.halfWidth} halfHeight=${meta.halfHeight}`);
}

main().catch((err) => {
  console.error(`stl-to-glb: ${err.message}`);
  process.exit(1);
});
