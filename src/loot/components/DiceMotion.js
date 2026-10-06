import * as THREE from 'three';

export function trayBounds(width, height, radius) {
  return { x: Math.max(0, width / 2 - radius - .16), y: Math.max(0, height / 2 - radius - .16) };
}

const STEP = 1 / 120;
// Precompute presentation motion, then choose the starting orientation so that
// the committed face arrives naturally at rest. Never correct orientation at rest.
export function planThrow(body, bounds, radius) {
  const frames = [];
  const rotation = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const delta = new THREE.Quaternion();
  const record = () => frames.push({ x: body.x, y: body.y, z: body.z, rotation: rotation.clone() });
  record();
  for (let step = 0; step < 12000; step++) {
    if (body.z > 0 || body.vz > 0) {
      body.vz -= 23 * STEP;
      body.z += body.vz * STEP;
      if (body.z <= 0) {
        const impact = Math.abs(body.vz);
        body.z = 0;
        body.vz = impact > 1.25 ? impact * .42 : 0;
        body.vx *= .86; body.vy *= .86;
        body.wx *= .8; body.wy *= .8; body.wz *= .65;
      }
    }
    const grounded = body.z === 0 && body.vz === 0;
    const rollingSpeed = Math.hypot(body.vx, body.vy);
    const resistance = rollingSpeed < .8 ? 4.5 : 1.25;
    const drag = Math.exp(-(grounded ? resistance / body.inertia : .12) * STEP);
    body.vx *= drag; body.vy *= drag;
    if (grounded) {
      // Rolling on a plane: angular velocity follows distance travelled.
      const grip = 1 - Math.exp(-18 * STEP);
      body.wx += (-body.vy / radius - body.wx) * grip;
      body.wy += (body.vx / radius - body.wy) * grip;
      body.wz *= Math.exp(-6 * STEP);
    } else {
      body.wx *= .999; body.wy *= .999; body.wz *= .999;
    }
    body.x += body.vx * STEP; body.y += body.vy * STEP;
    if (Math.abs(body.x) > bounds.x) {
      body.x = Math.sign(body.x) * bounds.x;
      body.vx = -Math.sign(body.x || 1) * Math.abs(body.vx) * .55;
      body.wy *= -.55;
    }
    if (Math.abs(body.y) > bounds.y) {
      body.y = Math.sign(body.y) * bounds.y;
      body.vy = -Math.sign(body.y || 1) * Math.abs(body.vy) * .55;
      body.wx *= -.55;
    }
    axis.set(body.wx, body.wy, body.wz);
    const angularSpeed = axis.length();
    if (angularSpeed > 0) {
      delta.setFromAxisAngle(axis.divideScalar(angularSpeed), angularSpeed * STEP);
      rotation.premultiply(delta).normalize();
    }
    record();
    const energy = .5 * body.mass * (body.vx ** 2 + body.vy ** 2 + body.vz ** 2)
      + .5 * body.inertia * angularSpeed ** 2;
    if (grounded && energy < .002) return { frames, step: STEP };
  }
  throw new Error('Dice motion could not settle. Please roll again.');
}
