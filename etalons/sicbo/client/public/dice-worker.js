// Headless dice pre-simulation worker
// Loaded as a classic worker from /public/dice-worker.js
// Depends on cannon.js loaded via importScripts

importScripts('https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js')

const FACE_VALUES = [1, 6, 2, 5, 3, 4]
const FACE_NORMALS = [
  [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]
]
const DICE_SIZE = 0.8
const HALF = DICE_SIZE / 2
const TABLE_R = 4.5  // must match DiceScene.tsx

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s & 0x7fffffff) / 2147483647
  }
}

function generateThrow(i, rand) {
  const angle  = (i / 3) * Math.PI * 2 + rand() * 0.8
  const radius = 0.3 + rand() * 0.6
  return {
    px:  Math.cos(angle) * radius + (rand() - 0.5) * 0.3,
    py:  4 + i * 0.6 + rand() * 0.8,
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
  }
}

function applyThrow(body, c) {
  body.position.set(c.px, c.py, c.pz)
  body.velocity.set(c.vx, c.vy, c.vz)
  body.angularVelocity.set(c.avx, c.avy, c.avz)
  const q1 = new CANNON.Quaternion()
  const q2 = new CANNON.Quaternion()
  const q3 = new CANNON.Quaternion()
  q1.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), c.rax)
  q2.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), c.ray)
  q3.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), c.raz)
  body.quaternion = q1.mult(q2).mult(q3)
  body.wakeUp()
}

function getDieTopFaceInfo(body) {
  const up = new CANNON.Vec3(0, 1, 0)
  let maxD = -Infinity, topIdx = 0
  for (let i = 0; i < 6; i++) {
    const [nx, ny, nz] = FACE_NORMALS[i]
    const wn = body.quaternion.vmult(new CANNON.Vec3(nx, ny, nz))
    const d = wn.dot(up)
    if (d > maxD) { maxD = d; topIdx = i }
  }
  return { value: FACE_VALUES[topIdx], maxDot: maxD }
}

function readDieValue(body) {
  return getDieTopFaceInfo(body).value
}

function areDiceSettled(bodies) {
  for (const b of bodies) {
    const v = b.velocity, av = b.angularVelocity
    if (v.x*v.x + v.y*v.y + v.z*v.z > 0.005) return false
    if (av.x*av.x + av.y*av.y + av.z*av.z > 0.005) return false
    const info = getDieTopFaceInfo(b)
    if (info.maxDot < 0.92) return false
  }
  return true
}

// Creates a world identical to the visual world in DiceScene.tsx
function createWorld() {
  const w = new CANNON.World()
  w.gravity.set(0, -18, 0)
  w.broadphase = new CANNON.NaiveBroadphase()
  w.solver.iterations = 20  // must match DiceScene.tsx
  w.allowSleep = false

  const dM = new CANNON.Material('dice')
  const fM = new CANNON.Material('floor')
  const wM = new CANNON.Material('wall')

  w.addContactMaterial(new CANNON.ContactMaterial(dM, fM, {
    friction: 0.5, restitution: 0.0,
    contactEquationStiffness: 1e7, contactEquationRelaxation: 3,
  }))
  w.addContactMaterial(new CANNON.ContactMaterial(dM, dM, {
    friction: 0.4, restitution: 0.3,
    contactEquationStiffness: 1e7, contactEquationRelaxation: 4,
  }))
  w.addContactMaterial(new CANNON.ContactMaterial(dM, wM, {
    friction: 0.2, restitution: 0.1,
  }))

  const fb = new CANNON.Body({ mass: 0, material: fM })
  fb.addShape(new CANNON.Plane())
  fb.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2)
  w.addBody(fb)

  const WALL_SEGMENTS = 32
  const WALL_R = TABLE_R + 0.15
  for (let i = 0; i < WALL_SEGMENTS; i++) {
    const angle = (i / WALL_SEGMENTS) * Math.PI * 2
    const wb = new CANNON.Body({ mass: 0, material: wM })
    wb.addShape(new CANNON.Box(new CANNON.Vec3(0.45, 2, 0.15)))
    wb.position.set(Math.cos(angle) * WALL_R, 2, Math.sin(angle) * WALL_R)
    wb.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle + Math.PI / 2)
    w.addBody(wb)
  }

  return { world: w, diceMat: dM }
}

function preSim(conds) {
  const { world: w, diceMat } = createWorld()
  const bodies = []

  for (const c of conds) {
    const b = new CANNON.Body({
      mass: 1.5, material: diceMat,
      linearDamping: 0.4, angularDamping: 0.4, allowSleep: false,
    })
    b.addShape(new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)))
    applyThrow(b, c)
    w.addBody(b)
    bodies.push(b)
  }

  const step = 1 / 120
  let stableFrames = 0
  for (let s = 0; s < 720; s++) {
    w.step(step)
    if (areDiceSettled(bodies)) {
      stableFrames++
      if (stableFrames > 30) break
    } else {
      stableFrames = 0
    }
  }

  return bodies.map(readDieValue)
}

self.onmessage = function(e) {
  const { target, maxAttempts, id } = e.data
  const t0 = performance.now()
  let lastConds = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = Math.floor(Math.random() * 2147483647)
    const rand = seededRandom(seed)
    const conds = [0, 1, 2].map(i => generateThrow(i, rand))
    const result = preSim(conds)
    lastConds = conds

    if (result[0] === target[0] && result[1] === target[1] && result[2] === target[2]) {
      self.postMessage({
        id,
        conds,
        matched: true,
        attempts: attempt + 1,
        ms: (performance.now() - t0).toFixed(1),
      })
      return
    }
  }

  self.postMessage({
    id,
    conds: lastConds,
    matched: false,
    attempts: maxAttempts,
    ms: (performance.now() - t0).toFixed(1),
  })
}
