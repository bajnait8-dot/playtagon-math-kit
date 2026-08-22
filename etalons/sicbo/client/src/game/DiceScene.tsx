import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import CANNON from "cannon";
import { NORMAL_TIMING, type DiceTiming } from "./turbo";

interface DiceSceneProps {
  values: [number, number, number];
  phase: "idle" | "rolling" | "result";
  isTriple: boolean;
  onSettled?: (values: [number, number, number]) => void;
  /**
   * Кубик коснулся стола или другого кубика. Зовётся на КАЖДОЕ ощутимое
   * касание каждого из трёх — сила удара (0..1) идёт наружу, чтобы хост мог
   * подстроить громкость.
   */
  onImpact?: (strength: number) => void;
  rotatableCamera?: boolean;
  /**
   * Куда улетают кубики после оседания — ЭКРАННЫЕ координаты ТРЁХ мест в табло
   * статистики, по одному на кубик. Сцена сама переведёт их в мировые: камера и
   * её матрицы живут только здесь.
   *
   * Не задано — кубики просто остаются лежать.
   */
  flyTo?: () => readonly { x: number; y: number }[] | null;
  /** Кубик коснулся табло — по одному на каждый, «тык, тык, тык». */
  onDieLanded?: () => void;
  /** Полёт закончился: все три кубика долетели до цели. */
  onFlewAway?: () => void;
  /**
   * Тайминги отыгрыша (обычные или турбо). Читаются на КАЖДОМ кадре через
   * stateRef, а не запоминаются при монтировании: турбо переключают прямо во
   * время броска, и режим обязан примениться сразу.
   */
  timing?: DiceTiming;
}

// ── Texture generator ─────────────────────────────────────────────────────────

function createDiceTexture(pips: number): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const positions: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.73], [0.73, 0.27]],
    3: [[0.27, 0.73], [0.5, 0.5], [0.73, 0.27]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  };

  const pipR = size * 0.082;
  for (const [px, py] of positions[pips]) {
    const x = px * size, y = py * size;
    ctx.beginPath(); ctx.arc(x + 3, y + 3, pipR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, pipR, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e"; ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

// BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
const FACE_VALUES = [1, 6, 2, 5, 3, 4];

const FACE_NORMALS_CANNON: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/**
 * Материалы кубика. Кэшируем НА ВСЮ СЦЕНУ: грани у трёх кубиков одинаковые, а
 * spawnDice зовётся на каждый бросок — без кэша каждый раунд создавал 18 новых
 * текстур и оставлял старые в видеопамяти.
 */
let sharedMaterials: THREE.MeshStandardMaterial[] | null = null;

function createDiceMaterials(): THREE.MeshStandardMaterial[] {
  sharedMaterials ??= FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({
    map: createDiceTexture(v),
    roughness: 0.05,
    metalness: 0.0,
  }));
  return sharedMaterials;
}

function getBoxMinY(q: { x: number; y: number; z: number; w: number }, halfSize: number): number {
  let minY = Infinity;
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  for (const sx of [-halfSize, halfSize]) {
    for (const sy of [-halfSize, halfSize]) {
      for (const sz of [-halfSize, halfSize]) {
        const vy = sy * (1 - 2 * (qx * qx + qz * qz)) +
                   sx * 2 * (qx * qy + qw * qz) +
                   sz * 2 * (qy * qz - qw * qx);
        if (vy < minY) minY = vy;
      }
    }
  }
  return minY;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DICE_SIZE = 0.8;
const HALF      = DICE_SIZE / 2;
const TABLE_R   = 4.5;
// Паузы отыгрыша (после оседания, полёт в табло) переехали в ./turbo —
// они зависят от режима, и турбо обязано менять их согласованно.

// ── Worker bridge ─────────────────────────────────────────────────────────────

interface ThrowConditions {
  px: number; py: number; pz: number;
  rax: number; ray: number; raz: number;
  avx: number; avy: number; avz: number;
  vx: number; vy: number; vz: number;
}

interface WorkerResult {
  id: number;
  conds: ThrowConditions[];
  matched: boolean;
  attempts: number;
  ms: string;
}

let workerInstance: Worker | null = null;
let workerReady = false;
const pendingCallbacks = new Map<number, (r: WorkerResult) => void>();
let nextRequestId = 0;

function getWorker(): Worker | null {
  if (workerInstance) return workerInstance;
  try {
    // ЧЕРЕЗ BASE_URL, не абсолютным путём: .playtagon хостится на sub-path, и
    // "/dice-worker.js" там вернёт 404 — воркер молча не поднимется, а подбор
    // броска свалится в синхронный перебор в основном потоке (залипание перед
    // броском). `playtagon check` этого не ловит.
    workerInstance = new Worker(`${import.meta.env.BASE_URL}dice-worker.js`);
    workerInstance.onmessage = (e: MessageEvent<WorkerResult>) => {
      const cb = pendingCallbacks.get(e.data.id);
      if (cb) {
        pendingCallbacks.delete(e.data.id);
        cb(e.data);
      }
    };
    workerReady = true;
    return workerInstance;
  } catch {
    return null;
  }
}

function requestThrow(
  target: [number, number, number],
  maxAttempts: number,
  callback: (r: WorkerResult) => void,
): number {
  const id = nextRequestId++;
  const worker = getWorker();
  if (worker && workerReady) {
    pendingCallbacks.set(id, callback);
    worker.postMessage({ target, maxAttempts, id });
  } else {
    // Fallback: synchronous
    const result = findThrowSync(target, maxAttempts);
    setTimeout(() => callback({ id, ...result }), 0);
  }
  return id;
}

// ── Sync fallback ─────────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}

function generateThrow(i: number, rand: () => number): ThrowConditions {
  const angle  = (i / 3) * Math.PI * 2 + rand() * 0.8;
  const radius = 0.3 + rand() * 0.6;
  return {
    px:  Math.cos(angle) * radius + (rand() - 0.5) * 0.3,
    // Ниже, чем было (4 + …): с прежней высоты кубики летели ~1с БЕЗЗВУЧНО,
    // и раунд начинался с паузы, в которой ничего не происходит.
    py:  2.4 + i * 0.45 + rand() * 0.5,
    pz:  Math.sin(angle) * radius + (rand() - 0.5) * 0.3,
    rax: rand() * Math.PI * 2,
    ray: rand() * Math.PI * 2,
    raz: rand() * Math.PI * 2,
    avx: (rand() - 0.5) * 28,
    avy: (rand() - 0.5) * 28,
    avz: (rand() - 0.5) * 28,
    vx:  (rand() - 0.5) * 8,
    vy:  -4 - rand() * 2,
    vz:  (rand() - 0.5) * 8,
  };
}

function applyThrow(body: CANNON.Body, c: ThrowConditions) {
  body.position.set(c.px, c.py, c.pz);
  body.velocity.set(c.vx, c.vy, c.vz);
  body.angularVelocity.set(c.avx, c.avy, c.avz);
  const q1 = new CANNON.Quaternion();
  const q2 = new CANNON.Quaternion();
  const q3 = new CANNON.Quaternion();
  q1.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), c.rax);
  q2.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), c.ray);
  q3.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), c.raz);
  body.quaternion = q1.mult(q2).mult(q3);
  body.wakeUp();
}

function getDieTopFaceInfo(body: CANNON.Body): { value: number; maxDot: number; topIdx: number } {
  const up = new CANNON.Vec3(0, 1, 0);
  let maxD = -Infinity, topIdx = 0;
  for (let i = 0; i < 6; i++) {
    const [nx, ny, nz] = FACE_NORMALS_CANNON[i];
    const wn = body.quaternion.vmult(new CANNON.Vec3(nx, ny, nz));
    const d = wn.dot(up);
    if (d > maxD) { maxD = d; topIdx = i; }
  }
  return { value: FACE_VALUES[topIdx], maxDot: maxD, topIdx };
}

function readDieValue(body: CANNON.Body): number {
  return getDieTopFaceInfo(body).value;
}

function findThrowSync(
  target: [number, number, number],
  maxAttempts: number,
): { conds: ThrowConditions[]; matched: boolean; attempts: number; ms: string } {
  const t0 = performance.now();
  let lastConds: ThrowConditions[] = [];

  function runSim(conds: ThrowConditions[]): number[] {
    const w = new CANNON.World();
    w.gravity.set(0, -18, 0);
    w.broadphase = new CANNON.NaiveBroadphase();
    w.solver.iterations = 20;
    w.allowSleep = false;
    const dM = new CANNON.Material("d");
    const fM = new CANNON.Material("f");
    const wM = new CANNON.Material("w");
    w.addContactMaterial(new CANNON.ContactMaterial(dM, fM, {
      friction: 0.5, restitution: 0.0,
      contactEquationStiffness: 1e7, contactEquationRelaxation: 3,
    }));
    w.addContactMaterial(new CANNON.ContactMaterial(dM, dM, {
      friction: 0.4, restitution: 0.3,
      contactEquationStiffness: 1e7, contactEquationRelaxation: 4,
    }));
    w.addContactMaterial(new CANNON.ContactMaterial(dM, wM, { friction: 0.2, restitution: 0.1 }));
    const fb = new CANNON.Body({ mass: 0, material: fM });
    fb.addShape(new CANNON.Plane());
    fb.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    w.addBody(fb);
    const WALL_SEGMENTS = 32;
    const WALL_R = TABLE_R + 0.15;
    for (let i = 0; i < WALL_SEGMENTS; i++) {
      const angle = (i / WALL_SEGMENTS) * Math.PI * 2;
      const wb = new CANNON.Body({ mass: 0, material: wM });
      wb.addShape(new CANNON.Box(new CANNON.Vec3(0.45, 2, 0.15)));
      wb.position.set(Math.cos(angle) * WALL_R, 2, Math.sin(angle) * WALL_R);
      wb.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle + Math.PI / 2);
      w.addBody(wb);
    }
    const bodies: CANNON.Body[] = [];
    for (const c of conds) {
      const b = new CANNON.Body({ mass: 1.5, material: dM, linearDamping: 0.4, angularDamping: 0.4, allowSleep: false });
      b.addShape(new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)));
      applyThrow(b, c);
      w.addBody(b);
      bodies.push(b);
    }
    let stable = 0;
    for (let s = 0; s < 720; s++) {
      w.step(1 / 120);
      const settled = bodies.every(b => {
        const v = b.velocity, av = b.angularVelocity;
        const info = getDieTopFaceInfo(b);
        return v.x*v.x+v.y*v.y+v.z*v.z < 0.005 && av.x*av.x+av.y*av.y+av.z*av.z < 0.005 && info.maxDot >= 0.92;
      });
      if (settled) { stable++; if (stable > 30) break; } else stable = 0;
    }
    return bodies.map(readDieValue);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rand = seededRandom(Math.floor(Math.random() * 2147483647));
    const conds = [0, 1, 2].map(i => generateThrow(i, rand));
    lastConds = conds;
    const result = runSim(conds);
    if (result[0] === target[0] && result[1] === target[1] && result[2] === target[2]) {
      return { conds, matched: true, attempts: attempt + 1, ms: (performance.now() - t0).toFixed(1) };
    }
  }
  return { conds: lastConds, matched: false, attempts: maxAttempts, ms: (performance.now() - t0).toFixed(1) };
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiceScene({ values, phase, isTriple, onSettled, onImpact, flyTo, onDieLanded, onFlewAway, rotatableCamera = false, timing = NORMAL_TIMING }: DiceSceneProps) {
  const mountRef      = useRef<HTMLDivElement>(null);
  const onSettledRef  = useRef(onSettled);
  onSettledRef.current = onSettled;
  const onImpactRef   = useRef(onImpact);
  onImpactRef.current = onImpact;
  const flyToRef      = useRef(flyTo);
  flyToRef.current    = flyTo;
  const onFlewAwayRef = useRef(onFlewAway);
  onFlewAwayRef.current = onFlewAway;
  const onDieLandedRef = useRef(onDieLanded);
  onDieLandedRef.current = onDieLanded;
  const settledFiredRef = useRef(false);
  // Тайминги идут через stateRef вместе с фазой: анимационная петля создаётся
  // ОДИН РАЗ (useEffect с пустыми зависимостями) и замкнула бы значение с
  // монтирования — переключение турбо по ходу броска не подействовало бы.
  const stateRef = useRef({ phase, values, isTriple, timing });
  stateRef.current = { phase, values, isTriple, timing };

  useEffect(() => {
    const el = mountRef.current!;
    const W = el.clientWidth || 800, H = el.clientHeight || 600;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c0c14, 0.025);
    const camera = new THREE.PerspectiveCamera(65, W / H, 0.1, 100);
    let camAngle = 0;

    // ── Lights ────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffe8cc, 1.2));
    const mainLight = new THREE.DirectionalLight(0xfff4e8, 0.8);
    mainLight.position.set(4, 12, 6);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.set(2048, 2048);
    mainLight.shadow.camera.near = 1; mainLight.shadow.camera.far = 30;
    mainLight.shadow.camera.left = -10; mainLight.shadow.camera.right = 10;
    mainLight.shadow.camera.top = 10; mainLight.shadow.camera.bottom = -10;
    mainLight.shadow.bias = -0.001; mainLight.shadow.radius = 8;
    scene.add(mainLight);

    const backLight = new THREE.DirectionalLight(0xaabbdd, 0.45);
    backLight.position.set(-6, 8, -4); scene.add(backLight);
    const fillLight = new THREE.PointLight(0x8899cc, 0.5, 25);
    fillLight.position.set(-5, 8, -3); scene.add(fillLight);
    const warmLight = new THREE.PointLight(0xff9966, 0.3, 20);
    warmLight.position.set(5, 4, -6); scene.add(warmLight);

    // ── Стол НЕ рисуем ────────────────────────────────────────────────────────
    // В taixiu здесь строилась своя сцена: красный цилиндр, сукно с иероглифами
    // 大/小 и деревянный бортик-торус. В Sic Bo под кубиками лежит НАШ стол на
    // 50 зон (Pixi), и чаша его просто перекрывала.
    //
    // Остаётся только невидимая плоскость — приёмник теней: без неё кубики
    // висят в воздухе без опоры под ними. shadowMaterial рисует ТОЛЬКО тень,
    // сама плоскость прозрачна.
    const shadowCatcher = new THREE.Mesh(
      new THREE.CircleGeometry(TABLE_R, 48),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.01;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    // ── Visual physics world ───────────────────────────────────────────────────
    const world = new CANNON.World();
    world.gravity.set(0, -18, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 20;
    world.allowSleep = true;

    const dicePMat  = new CANNON.Material("dice");
    const floorPMat = new CANNON.Material("floor");
    const wallPMat  = new CANNON.Material("wall");

    world.addContactMaterial(new CANNON.ContactMaterial(dicePMat, floorPMat, {
      friction: 0.5, restitution: 0.0,
      contactEquationStiffness: 1e7, contactEquationRelaxation: 3,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(dicePMat, dicePMat, {
      friction: 0.4, restitution: 0.3,
      contactEquationStiffness: 1e7, contactEquationRelaxation: 4,
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(dicePMat, wallPMat, {
      friction: 0.2, restitution: 0.1,
    }));

    const floorBody = new CANNON.Body({ mass: 0, material: floorPMat });
    floorBody.addShape(new CANNON.Plane());
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(floorBody);

    const WALL_SEGMENTS = 32;
    const WALL_R = TABLE_R + 0.15;
    for (let i = 0; i < WALL_SEGMENTS; i++) {
      const angle = (i / WALL_SEGMENTS) * Math.PI * 2;
      const wb = new CANNON.Body({ mass: 0, material: wallPMat });
      wb.addShape(new CANNON.Box(new CANNON.Vec3(0.45, 2, 0.15)));
      wb.position.set(Math.cos(angle) * WALL_R, 2, Math.sin(angle) * WALL_R);
      wb.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle + Math.PI / 2);
      world.addBody(wb);
    }

    // ── Dice management ───────────────────────────────────────────────────────
    interface DieObj { mesh: THREE.Mesh; body: CANNON.Body }
    const dice: DieObj[] = [];
    const dieGeo = new RoundedBoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, 4, DICE_SIZE * 0.12);

    function spawnDice(conds: ThrowConditions[]) {
      dice.forEach(d => { scene.remove(d.mesh); world.remove(d.body); });
      dice.length = 0;
      spawnTime = performance.now();
      for (let i = 0; i < 3; i++) {
        const mesh = new THREE.Mesh(dieGeo, createDiceMaterials());
        mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
        const body = new CANNON.Body({
          mass: 1.5, material: dicePMat,
          linearDamping: 0.4, angularDamping: 0.4, allowSleep: true,
          sleepSpeedLimit: 0.1, sleepTimeLimit: 0.3,
        });
        body.addShape(new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)));
        applyThrow(body, conds[i]);
        world.addBody(body);
        // Звук касания. Порог по скорости отсекает дребезг: кубик, катящийся
        // по столу, иначе выдаёт десяток срабатываний в секунду. Плюс пауза
        // между ударами ОДНОГО кубика — по той же причине.
        let lastHit = 0;
        body.addEventListener("collide", (e: { contact?: { getImpactVelocityAlongNormal(): number } }) => {
          const v = Math.abs(e.contact?.getImpactVelocityAlongNormal() ?? 0);
          if (v < 2.2) return;
          const now = performance.now();
          if (now - lastHit < 140) return;
          lastHit = now;
          onImpactRef.current?.(Math.min(1, v / 8));
        });

        dice.push({ mesh, body });
      }
    }

    function setTripleGlow(on: boolean) {
      dice.forEach(d => {
        const mats = Array.isArray(d.mesh.material) ? d.mesh.material : [d.mesh.material];
        mats.forEach((m: THREE.Material) => {
          if (m instanceof THREE.MeshStandardMaterial) {
            m.emissive.setRGB(on ? 0.12 : 0, on ? 0.08 : 0, 0);
            m.emissiveIntensity = on ? 1 : 0;
          }
        });
      });
    }

    // ── Fallback correction ────────────────────────────────────────────────────
    let needsCorrection = false;
    let correctionTarget: [number, number, number] = [1, 1, 1];
    let spawnTime = 0;

    function tickCorrection() {
      if (!dice.length) return;

      if (needsCorrection) {
        for (let i = 0; i < dice.length; i++) {
          if (readDieValue(dice[i].body) === correctionTarget[i]) continue;
          if (dice[i].body.position.y > 0.6) {
            const targetFaceIdx = FACE_VALUES.indexOf(correctionTarget[i]);
            const [nx, ny, nz] = FACE_NORMALS_CANNON[targetFaceIdx];
            const tq = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(nx, ny, nz), new THREE.Vector3(0, 1, 0),
            );
            const mq = dice[i].mesh.quaternion.clone().slerp(tq, 0.05);
            dice[i].body.quaternion.set(mq.x, mq.y, mq.z, mq.w);
          }
        }
      }

      let allSlow = true;
      for (const d of dice) {
        const v = d.body.velocity, av = d.body.angularVelocity;
        if (v.x*v.x+v.y*v.y+v.z*v.z > 0.04 || av.x*av.x+av.y*av.y+av.z*av.z > 0.04) {
          allSlow = false; break;
        }
      }
      if (!allSlow) return;

      let allFlatAndCorrect = true;
      for (let i = 0; i < dice.length; i++) {
        const info = getDieTopFaceInfo(dice[i].body);
        const targetVal = needsCorrection ? correctionTarget[i] : info.value;
        if (info.value !== targetVal || info.maxDot < 0.96) {
          allFlatAndCorrect = false;
          const targetFaceIdx = FACE_VALUES.indexOf(targetVal);
          const [nx, ny, nz] = FACE_NORMALS_CANNON[targetFaceIdx];
          const tq = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(nx, ny, nz), new THREE.Vector3(0, 1, 0),
          );
          const mq = dice[i].mesh.quaternion.clone().slerp(tq, 0.12);
          const minY = getBoxMinY(mq, HALF);
          dice[i].body.quaternion.set(mq.x, mq.y, mq.z, mq.w);
          dice[i].body.position.y = -minY + 0.0005;
          dice[i].body.velocity.set(0, 0, 0);
          dice[i].body.angularVelocity.set(0, 0, 0);
        }
      }
      if (allFlatAndCorrect && needsCorrection) {
        needsCorrection = false;
        dice.forEach(d => d.body.sleep());
      }
    }

    let activeRequestId = -1;

    // ── Animation loop ────────────────────────────────────────────────────────
    const FIXED_STEP = 1 / 120;
    let accumulator  = 0;
    let lastTime     = performance.now();
    let prevPhase    = stateRef.current.phase;
    let settled      = false;
    let settledTimer = 0;
    let rafId        = 0;

    /**
     * Полёт кубиков в табло после оседания.
     *
     * Кубики ОТВЯЗЫВАЮТСЯ от физики (тела убираем из мира) и дальше ведутся
     * вручную по дуге к точке цели. Цель приходит в ЭКРАННЫХ координатах и
     * переводится в мировые здесь: вне сцены камеры нет.
     */
    let flying: {
      mesh: THREE.Mesh;
      from: THREE.Vector3; ctrl: THREE.Vector3; to: THREE.Vector3;
      spin: THREE.Vector3;
      /** Своя задержка старта — кубики уходят ПО ОЧЕРЕДИ, а не разом. */
      delay: number;
      /** Свой прогресс 0..1 и флаг «уже долетел». */
      t: number;
      landed: boolean;
    }[] = [];
    let flyClock = 0;
    let flyFired = false;
    /** Длительность текущего полёта — снимается с таймингов в startFlight. */
    let flySec = NORMAL_TIMING.flySec;
    /**
     * Пауза между оседанием кубиков и вылетом в табло: игрок должен успеть
     * увидеть выпавшую комбинацию. Отрицательное — ещё не осели.
     */
    let settleHold = -1;

    // Spawn idle dice
    const initRand = seededRandom(42);
    spawnDice([0, 1, 2].map(i => generateThrow(i, initRand)));

    function checkSettled() {
      if (settled || dice.length === 0) return;
      if (stateRef.current.phase !== "result") return;

      let allQuiet = true;
      for (const d of dice) {
        const sleeping = (d.body as unknown as { sleepState: number }).sleepState === 2;
        if (sleeping) continue;
        const v = d.body.velocity, av = d.body.angularVelocity;
        const linSq = v.x*v.x + v.y*v.y + v.z*v.z;
        const angSq = av.x*av.x + av.y*av.y + av.z*av.z;
        if (linSq > 0.05 || angSq > 0.05) { allQuiet = false; break; }
      }

      if (allQuiet) {
        settledTimer++;
      } else {
        settledTimer = 0;
      }

      if (spawnTime > 0 && performance.now() - spawnTime > 5000) {
        settledTimer = 999;
      }
      if (settledTimer > 30) {
        settled = true;
        if (!settledFiredRef.current) {
          settledFiredRef.current = true;
          const actualValues: [number, number, number] = [
            readDieValue(dice[0].body),
            readDieValue(dice[1].body),
            readDieValue(dice[2].body),
          ];
          onSettledRef.current?.(actualValues);
        }
      }
    }

    /**
     * Экранную точку — в мировую, на глубине кубиков.
     *
     * Берём НЕПРОЕЦИРОВАННЫЙ луч из камеры через точку экрана и находим, где он
     * пересекает плоскость, параллельную экрану и проходящую через центр стола.
     * Так кубик приходит ровно в табло при любом разрешении.
     */
    function screenToWorld(sx: number, sy: number): THREE.Vector3 {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector3(
        ((sx - rect.left) / rect.width) * 2 - 1,
        -((sy - rect.top) / rect.height) * 2 + 1,
        0.5,
      );
      ndc.unproject(camera);
      const dir = ndc.sub(camera.position).normalize();
      // Плоскость на высоте стола: кубики летят «над сукном», не ныряя вглубь.
      const t = (1.2 - camera.position.y) / dir.y;
      return camera.position.clone().add(dir.multiplyScalar(t));
    }

    /** Отправить осевшие кубики к их местам в табло. */
    function startFlight(): void {
      const targets = flyToRef.current?.();
      if (!targets || targets.length === 0 || dice.length === 0) return;

      // Длительность полёта фиксируем НА СТАРТЕ и держим до конца: переключение
      // турбо в середине дуги иначе teleportировало бы кубик (прогресс
      // считается от неё), а это читается как сбой, а не как ускорение.
      flySec = stateRef.current.timing.flySec;
      const stagger = stateRef.current.timing.flyStagger;

      flying = dice.map((d, i) => {
        // У КАЖДОГО кубика своё место в табло — там три ячейки, а не одна.
        const t = targets[i] ?? targets[targets.length - 1];
        const to = screenToWorld(t.x, t.y);
        const from = d.mesh.position.clone();
        // Контрольная точка ВЫШЕ и ближе к старту — кубик круто взмывает и
        // полого заходит на цель.
        const ctrl = from.clone().lerp(to, 0.35);
        ctrl.y = Math.max(from.y, to.y) + 3.2;
        return {
          mesh: d.mesh,
          from,
          ctrl,
          to,
          // Каждый крутится по-своему — полёт не выглядит механическим.
          spin: new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6,
          ),
          delay: i * stagger,
          t: 0,
          landed: false,
        };
      });
      // Физика больше не ведёт кубики: дальше их двигает только эта анимация.
      dice.forEach((d) => world.remove(d.body));
      flyClock = 0;
      flyFired = false;
    }

    /**
     * Шаг полёта. Каждый кубик идёт ПО СВОИМ часам со своей задержкой —
     * получается «тык, тык, тык», а не один общий бросок.
     * Возвращает true, пока хоть один ещё в воздухе.
     */
    function stepFlight(dt: number): boolean {
      if (flying.length === 0) return false;
      flyClock += dt;

      let anyMoving = false;
      for (const f of flying) {
        if (f.landed) continue;
        // До своей очереди кубик просто лежит.
        const local = flyClock - f.delay;
        if (local < 0) { anyMoving = true; continue; }

        f.t = Math.min(1, local / flySec);
        // Медленный отрыв и разгон к табло.
        const e = f.t * f.t;
        const u = 1 - e;
        f.mesh.position.set(
          u * u * f.from.x + 2 * u * e * f.ctrl.x + e * e * f.to.x,
          u * u * f.from.y + 2 * u * e * f.ctrl.y + e * e * f.to.y,
          u * u * f.from.z + 2 * u * e * f.ctrl.z + e * e * f.to.z,
        );
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
        f.mesh.rotation.z += f.spin.z * dt;
        // Уменьшается к табло — там кубики мельче, чем на столе.
        const s = 1 - 0.55 * e;
        f.mesh.scale.set(s, s, s);

        if (f.t >= 1) {
          f.landed = true;
          f.mesh.visible = false;
          // Удар КАЖДОГО кубика — по нему хост даёт звук и отскок табло.
          onDieLandedRef.current?.();
        } else {
          anyMoving = true;
        }
      }

      // Все долетели — раунд можно записывать в историю.
      if (!anyMoving && !flyFired) {
        flyFired = true;
        onFlewAwayRef.current?.();
      }
      return anyMoving;
    }

    function animate() {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      // Сырой шаг реального времени. Кламп 0.05 — защита от «прыжка» после
      // сворачивания вкладки: без него накопитель отработал бы сотни шагов
      // физики разом.
      const dtReal = Math.min((now - lastTime) / 1000, 0.05);
      lastTime  = now;

      const { phase: p, values: vals, isTriple, timing: tm } = stateRef.current;
      // ТУРБО = время идёт быстрее. Масштабируем шаг, а не силу броска: исход
      // уже решён сервером, и трогать импульсы значило бы пересобирать подбор
      // в воркере.
      const dt = dtReal * tm.timeScale;

      if (p !== prevPhase) {
        if (p === "rolling") {
          // Полёт прошлого раунда обрываем: его меши уходят вместе с кубиками.
          flying = []; flyClock = 0; flyFired = false; settleHold = -1;
          dice.forEach(d => { scene.remove(d.mesh); world.remove(d.body); });
          dice.length  = 0;
          settled      = false;
          settledTimer = 0;
          needsCorrection = false;
          if (activeRequestId >= 0) { pendingCallbacks.delete(activeRequestId); activeRequestId = -1; }
        }
        if (p === "result") {
          settled               = false;
          settledTimer          = 0;
          settledFiredRef.current = false;
          needsCorrection       = false;
          correctionTarget      = vals;
          flying = []; flyClock = 0; flyFired = false; settleHold = -1;

          dice.forEach(d => { scene.remove(d.mesh); world.remove(d.body); });
          dice.length = 0;

          activeRequestId = requestThrow(vals, 1200, (workerResult) => {
            if (stateRef.current.phase !== "result") return;
            needsCorrection = !workerResult.matched;
            spawnDice(workerResult.conds);
          });
        }
        if (p === "idle") {
          settled      = false;
          settledTimer = 0;
        }
        prevPhase = p;
      }

      // Пока кубики ЛЕТЯТ в табло, физика их больше не ведёт: тела убраны из
      // мира, а меши двигает stepFlight. Синхронизация меша с телом здесь
      // вернула бы их на стол.
      const inFlight = stepFlight(dt);

      if (!inFlight) {
        accumulator += dt;
        while (accumulator >= FIXED_STEP) { world.step(FIXED_STEP); accumulator -= FIXED_STEP; }

        tickCorrection();
        const wasSettled = settled;
        checkSettled();
        // Осели ТОЛЬКО ЧТО — заводим паузу, чтобы комбинацию было видно.
        if (!wasSettled && settled && flying.length === 0) settleHold = 0;
        // Пауза вышла — отправляем в табло.
        if (settleHold >= 0 && flying.length === 0) {
          settleHold += dt;
          if (settleHold >= tm.settleHoldSec) { settleHold = -1; startFlight(); }
        }

        if (flying.length === 0) {
          dice.forEach(d => {
            d.mesh.position.copy(d.body.position as unknown as THREE.Vector3);
            d.mesh.quaternion.copy(d.body.quaternion as unknown as THREE.Quaternion);
          });
        }
      }

      const aspect = el.clientWidth && el.clientHeight ? el.clientWidth / el.clientHeight : 1;
      const responsiveScale = Math.max(1.0, 1.2 / Math.max(aspect, 0.45));
      const camDist = 5 * responsiveScale;

      if (rotatableCamera) camAngle += dt * 0.06;
      camera.position.set(Math.cos(camAngle) * camDist, camDist, Math.sin(camAngle) * camDist);
      camera.lookAt(0, -1.5, 0);

      setTripleGlow(isTriple && settled);
      renderer.render(scene, camera);
    }

    animate();

    const ro = new ResizeObserver(() => {
      const nW = el.clientWidth, nH = el.clientHeight;
      if (nW === 0 || nH === 0) return;
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
      renderer.setSize(nW, nH);
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      if (activeRequestId >= 0) pendingCallbacks.delete(activeRequestId);
      ro.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Размеры ИНЛАЙНОМ, а не Tailwind-классами как в taixiu: у нас Tailwind нет,
  // классы «w-full h-full» не резолвятся, div схлопывается — и канвас получает
  // размер по умолчанию вместо размера экрана.
  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
