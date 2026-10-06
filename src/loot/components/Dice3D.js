import * as THREE from 'three';
import { trayBounds, planThrow } from './DiceMotion.js';
import { normalizeAppearance } from '../systems/DiceAppearance.js';
import { skinTexture, numberTexture, materialValues } from './DiceSkin.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
function geometryFor() { return new THREE.IcosahedronGeometry(1.38, 0); }
function makeLabel(value, sides, face, appearance) {
  const texture = numberTexture(value, appearance);
  const labelSize = .72;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(labelSize, labelSize), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  label.position.copy(face.center).addScaledVector(face.normal, .035);
  label.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal);
  return label;
}
function facesFor(geometry) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex(), groups = new Map(), count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    const ids = [0,1,2].map(j => index ? index.getX(i+j) : i+j);
    const a = new THREE.Vector3().fromBufferAttribute(position,ids[0]), b = new THREE.Vector3().fromBufferAttribute(position,ids[1]), c = new THREE.Vector3().fromBufferAttribute(position,ids[2]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize(), key = `${normal.x.toFixed(2)},${normal.y.toFixed(2)},${normal.z.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key,{normal,center:new THREE.Vector3(),count:0}); const f=groups.get(key); f.center.add(a).add(b).add(c); f.count+=3;
  }
  return [...groups.values()].map(face=>{face.center.multiplyScalar(1/face.count);return face;});
}
function makeDie(sides, appearance) {
  const root = new THREE.Group(), geometry = geometryFor(sides);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({...materialValues(appearance),map:skinTexture(appearance),flatShading:true,side:THREE.DoubleSide}));root.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:appearance.edgeColor,transparent:true,opacity:.9})); root.add(edges);
  const faces=facesFor(geometry).map((face,i)=>{const value=i+1,label=makeLabel(value,sides,face,appearance);root.add(label);return {...face,value,label};});
  return {root,faces,mesh,edges};
}
function makeShadow() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,.9)');
  gradient.addColorStop(.45, 'rgba(0,0,0,.5)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
  }));
}
export class Dice3D {
  constructor(host, appearance) {
    this.appearance = normalizeAppearance(appearance);
    this.host = host;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(2.6 / 10)), 1, .1, 30);
    this.camera.position.set(0, 0, 10);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, .04);
    this.scene.environment = this.environment.texture;
    room.dispose(); pmrem.dispose();
    host.replaceChildren(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffe4b0, 0x221935, .85));
    const key = new THREE.DirectionalLight(0xffd580, 4.8);
    key.position.set(3, 4, 5);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x9a6eda, 25);
    rim.position.set(-4, -2, 3);
    this.scene.add(rim);
    this.roots = [];
    this.disposed = false;
    this.settled = false;
    this.motion = null;
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.frame(performance.now());
  }

  fit() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.viewHeight = 5.2;
    this.viewWidth = this.viewHeight * width / height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const count = this.roots.length;
    const radius = Math.min(count === 2 ? 1.08 : 1.42, this.viewWidth / (count === 2 ? 5.3 : 2.7));
    this.roots.forEach((die, index) => {
      die.radius = radius;
      die.root.scale.setScalar(radius / 1.38);
      if (!this.motion) die.laneCenter = count === 2 ? (index ? 1 : -1) * this.viewWidth / 4 : 0;
      if (!this.motion && !this.settled) die.root.position.set(die.laneCenter, 0, 0);
    });
  }

  bounds(die) {
    // Reserve projection space for the full launch height and spinning corners.
    const depth = (10 - 1.15 - die.radius) / 10;
    const total = trayBounds(this.viewWidth * depth, this.viewHeight * depth, die.radius);
    if (this.roots.length === 2) {
      die.laneCenter = (die.laneCenter < 0 ? -1 : 1) * this.viewWidth * depth / 4;
      total.x = Math.max(0, this.viewWidth * depth / 4 - die.radius - .08);
    }
    return total;
  }

  updateShadow(die) {
    const height = Math.max(0, die.root.position.z);
    die.shadow.position.set(die.root.position.x + .12 + height * .14, die.root.position.y - .13 - height * .16, -die.radius - .03);
    const size = die.radius * (2.6 + height * .65);
    die.shadow.scale.set(size, size * .8, 1);
    die.shadow.material.opacity = .85 / (1 + height * .85);
  }

  attach(host) {
    if (this.host === host) return;
    this.resize.unobserve(this.host);
    this.host = host;
    host.replaceChildren(this.renderer.domElement);
    this.resize.observe(host);
    this.fit();
  }

  releaseDie(die) {
    this.scene.remove(die.root, die.shadow);
    die.shadow.geometry.dispose(); die.shadow.material.map.dispose(); die.shadow.material.dispose();
    die.root.traverse((node) => {
      node.geometry?.dispose();
      if (node.material) { node.material.map?.dispose(); node.material.dispose(); }
    });
  }

  setDie(_sides, count = 1) {
    if (this.roots.length === count) return;
    this.cancelMotion();
    this.roots.forEach((die) => this.releaseDie(die));
    this.roots = Array.from({ length: count }, (_, index) => {
      const die = makeDie(20, this.appearance);
      die.radius = count === 2 ? .59 : .76;
      die.root.scale.setScalar(die.radius / 1.38);
      die.root.position.x = count === 2 ? (index === 0 ? -.78 : .78) : 0;
      die.root.rotation.set(.42, .62 + index * .8, .12);
      die.shadow = makeShadow();
      this.scene.add(die.shadow, die.root);
      this.updateShadow(die);
      return die;
    });
    this.settled = false;
    this.fit();
  }

  setAppearance(value) {
    const next = normalizeAppearance(value);
    if (JSON.stringify(next) === JSON.stringify(this.appearance)) return;
    this.appearance = next;
    this.roots.forEach((die) => {
      die.mesh.material.map?.dispose();
      die.mesh.material.setValues({ ...materialValues(next), map: skinTexture(next) });
      die.mesh.material.needsUpdate = true;
      die.edges.material.color.set(next.edgeColor);
      die.faces.forEach((face) => {
        face.label.material.map.dispose();
        face.label.material.map = numberTexture(face.value, next);
        face.label.material.needsUpdate = true;
      });
    });
  }

  cancelMotion() {
    if (this.motion) { this.motion.resolve(); this.motion = null; }
  }

  rollTo(rawRolls, mode = 'normal') {
    if (this.disposed) return Promise.resolve();
    this.cancelMotion();
    this.setDie(20, rawRolls.length);
    const chosen = mode === 'adv' ? Math.max(...rawRolls) : mode === 'dis' ? Math.min(...rawRolls) : rawRolls[0];
    const chosenIndex = rawRolls.indexOf(chosen);
    this.settled = false;
    // The requested full spin takes precedence over the OS motion preference.
    const bodies = this.roots.map((die, index) => {
      const face = die.faces.find((candidate) => candidate.value === rawRolls[index]);
      if (!face) throw new Error('D20 roll must be between 1 and 20.');

      die.mesh.material.color.set(this.appearance.bodyColor);
      const bounds = this.bounds(die);
      const mass = 1.6;
      const edge = Math.floor(Math.random() * 4);
      const along = Math.random() * 1.7 - .85;
      const launchX = edge < 2 ? (edge ? 1 : -1) * bounds.x * .88 : along * bounds.x;
      const launchY = edge >= 2 ? (edge === 2 ? -1 : 1) * bounds.y * .88 : along * bounds.y;
      const angle = Math.atan2(-launchY, -launchX) + (Math.random() - .5) * 1.1;
      const speed = 5 + Math.random() * 2.5;
      const physical = {
        x: launchX, y: launchY,
        z: .85 + Math.random() * .1, vz: 1.6 + Math.random() * .5,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        mass, inertia: Math.max(.9, .4 * mass * die.radius ** 2),
        wx: (Math.random() < .5 ? -1 : 1) * (18 + Math.random() * 5), wy: (Math.random() < .5 ? -1 : 1) * (23 + Math.random() * 5), wz: (Math.random() - .5) * 18,
      };
      const plan = planThrow(physical, bounds, die.radius);
      const last = plan.frames.at(-1);
      const finalPosition = new THREE.Vector3(last.x + die.laneCenter, last.y, last.z);
      const normal = this.camera.position.clone().sub(finalPosition).normalize();
      const right = new THREE.Vector3().crossVectors(this.camera.up, normal).normalize();
      const up = new THREE.Vector3().crossVectors(normal, right).normalize();
      const targetRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal))
        .multiply(face.label.quaternion.clone().invert());
      // A(final) * Q(start) = Q(result). Solve before the first visible frame.
      const startRotation = last.rotation.clone().invert().multiply(targetRotation);
      const body = { plan, startRotation, elapsed: 0, done: false, keep: index === chosenIndex };
      const first = plan.frames[0];
      die.root.position.set(first.x + die.laneCenter, first.y, first.z);
      die.root.quaternion.copy(startRotation);
      return body;
    });
    return new Promise((resolve) => {
      this.motion = { bodies, resolve };
    });
  }

  frame = (time) => {
    if (this.disposed) return;
    const dt = Math.min(.04, Math.max(0, (time - (this.lastFrame ?? time)) / 1000));
    this.lastFrame = time;
    const motion = this.motion;
    if (motion) {
      motion.bodies.forEach((body, index) => {
        const die = this.roots[index];
        if (body.done) return;
        body.elapsed += dt;
        const cursor = Math.min(body.elapsed / body.plan.step, body.plan.frames.length - 1);
        const indexA = Math.floor(cursor);
        const a = body.plan.frames[indexA];
        const b = body.plan.frames[Math.min(indexA + 1, body.plan.frames.length - 1)];
        const alpha = cursor - indexA;
        die.root.position.set(
          THREE.MathUtils.lerp(a.x, b.x, alpha) + die.laneCenter,
          THREE.MathUtils.lerp(a.y, b.y, alpha),
          THREE.MathUtils.lerp(a.z, b.z, alpha),
        );
        die.root.quaternion.copy(a.rotation).slerp(b.rotation, alpha).multiply(body.startRotation);
        body.done = cursor >= body.plan.frames.length - 1;
      });
      if (motion.bodies.every((body) => body.done)) {
        this.roots.forEach((die, index) => die.mesh.material.color.set(this.appearance.bodyColor).multiplyScalar(motion.bodies[index].keep ? 1 : .45));
        this.settled = true;
        this.motion = null;
        motion.resolve();
      }
    } else if (!this.settled) {
      this.roots.forEach((die) => { die.root.rotation.y += dt * .28; });
    }
    this.roots.forEach((die) => this.updateShadow(die));
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose() {
    this.disposed = true;
    this.cancelMotion();
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.roots.forEach((die) => this.releaseDie(die));
    this.environment.dispose();
    this.renderer.dispose();
  }
}
