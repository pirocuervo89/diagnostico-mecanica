// Cabina 3D del GT4 (Three.js, vendorizado). Se dibuja sobre la cámara con
// fondo transparente: el parabrisas queda libre para ver la carretera real.
import * as THREE from '/vendor/three/three.module.min.js';

let renderer = null;
let scene = null;
let camera = null;
let raf = 0;
let canvasRef = null;
let wheelGroup = null;
let pantallaVel = null;
let pantallaRuta = null;
let ctxVel = null;
let ctxRuta = null;
let texVel = null;
let texRuta = null;
let t0 = performance.now();
let ultimoEstado = { velocidad: 0, marcha: 'N', distancia: 0, eta: 0, maniobra: '', color: '#22d3ee' };

function texturaCarbono() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0f15';
  g.fillRect(0, 0, 64, 64);
  for (let i = -64; i < 64; i += 8) {
    g.strokeStyle = i % 16 === 0 ? '#151b24' : '#10151c';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

function crearPantalla(w, h) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return { mesh, ctx, tex };
}

function pintarPantallas() {
  const { velocidad, marcha, distancia, eta, color } = ultimoEstado;
  if (ctxVel) {
    const c = ctxVel;
    c.clearRect(0, 0, 512, 256);
    c.fillStyle = 'rgba(3,8,14,0.85)';
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = color; c.lineWidth = 6;
    c.strokeRect(6, 6, 500, 244);
    c.fillStyle = color;
    c.font = 'bold 150px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(String(Math.round(velocidad)), 24, 138);
    c.fillStyle = '#cfe9ff';
    c.font = 'bold 40px system-ui, sans-serif';
    c.fillText('KM/H', 24, 226);
    c.fillStyle = '#eaf7ff';
    c.font = 'bold 110px system-ui, sans-serif';
    c.textAlign = 'right';
    c.fillText(marcha, 492, 130);
    texVel.needsUpdate = true;
  }
  if (ctxRuta) {
    const c = ctxRuta;
    c.clearRect(0, 0, 512, 256);
    c.fillStyle = 'rgba(3,8,14,0.85)';
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = 'rgba(56,225,255,0.6)'; c.lineWidth = 6;
    c.strokeRect(6, 6, 500, 244);
    c.fillStyle = '#eaf7ff';
    c.font = 'bold 96px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const txt = distancia >= 1000 ? `${(distancia / 1000).toFixed(1)} km` : `${Math.round(distancia)} m`;
    c.fillText(txt, 256, 104);
    c.fillStyle = '#8fd6ff';
    c.font = 'bold 52px system-ui, sans-serif';
    c.fillText(`${Math.round(eta)} min`, 256, 190);
    texRuta.needsUpdate = true;
  }
}

export function montar(canvas) {
  if (!canvas || renderer) return;
  canvasRef = canvas;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(68, w / h, 0.05, 30);
  camera.position.set(0, 1.18, 0.25);
  camera.lookAt(0, 1.02, -1.2);

  // Luces suaves de cabina
  scene.add(new THREE.AmbientLight(0x334455, 1.1));
  const hemi = new THREE.HemisphereLight(0x224466, 0x080808, 0.9);
  scene.add(hemi);
  const cyan = new THREE.PointLight(0x38e1ff, 2.2, 3);
  cyan.position.set(-0.6, 1.25, -0.4);
  scene.add(cyan);
  const violeta = new THREE.PointLight(0xa855f7, 1.6, 3);
  violeta.position.set(0.7, 1.15, -0.3);
  scene.add(violeta);

  const carbono = texturaCarbono();
  const matCuero = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.85, metalness: 0.15 });
  const matCarbono = new THREE.MeshStandardMaterial({ map: carbono, roughness: 0.55, metalness: 0.5 });
  const matEmisivo = new THREE.MeshStandardMaterial({ color: 0x0a1018, emissive: 0x22d3ee, emissiveIntensity: 1.2 });
  const matCromo = new THREE.MeshStandardMaterial({ color: 0x9aa7b5, roughness: 0.25, metalness: 0.9 });

  // Salpicadero
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.30, 0.55), matCarbono);
  dash.position.set(0, 0.82, -1.05);
  scene.add(dash);

  const dashTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.10, 0.62), matCuero);
  dashTop.position.set(0, 1.00, -1.02);
  scene.add(dashTop);

  // Consola central
  const consola = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.72), matCarbono);
  consola.position.set(0, 0.62, -0.72);
  scene.add(consola);
  const tiraLed = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.012, 0.5), matEmisivo);
  tiraLed.position.set(0, 0.88, -0.75);
  scene.add(tiraLed);

  // Volante
  wheelGroup = new THREE.Group();
  wheelGroup.position.set(0, 0.80, -0.52);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 14, 40), matCuero);
  wheelGroup.add(rim);
  const rimGlow = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.006, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0x0a0f16, emissive: 0x38e1ff, emissiveIntensity: 1.4 }));
  wheelGroup.add(rimGlow);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 24), matCromo);
  hub.rotation.x = Math.PI / 2;
  wheelGroup.add(hub);
  // radios
  const radioH = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.028, 0.02), matCuero);
  wheelGroup.add(radioH);
  const radioV = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.14, 0.02), matCuero);
  radioV.position.set(0, -0.10, 0);
  wheelGroup.add(radioV);
  scene.add(wheelGroup);

  // Pantallas digitales
  const pv = crearPantalla(0.30, 0.135);
  pv.mesh.position.set(-0.42, 0.99, -0.68);
  pv.mesh.rotation.x = -0.5;
  scene.add(pv.mesh);
  pantallaVel = pv.mesh; ctxVel = pv.ctx; texVel = pv.tex;

  const pr = crearPantalla(0.30, 0.135);
  pr.mesh.position.set(0.42, 0.99, -0.68);
  pr.mesh.rotation.x = -0.5;
  scene.add(pr.mesh);
  pantallaRuta = pr.mesh; ctxRuta = pr.ctx; texRuta = pr.tex;

  // Pilares A y techo
  const pilarMat = matCuero;
  for (const sx of [-1, 1]) {
    const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.10), pilarMat);
    pilar.position.set(sx * 0.80, 1.32, -0.52);
    pilar.rotation.z = sx * 0.30;
    scene.add(pilar);
  }
  const techo = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.45), matCuero);
  techo.position.set(0, 1.72, -0.45);
  scene.add(techo);
  const espejo = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.05), matCuero);
  espejo.position.set(0, 1.58, -0.55);
  scene.add(espejo);

  pintarPantallas();
  bucle();

  window.addEventListener('resize', redimensionar, { passive: true });
}

function redimensionar() {
  if (!canvasRef || !renderer || !camera) return;
  const w = canvasRef.clientWidth || window.innerWidth;
  const h = canvasRef.clientHeight || window.innerHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function bucle() {
  raf = requestAnimationFrame(bucle);
  if (!renderer || !scene || !camera) return;
  const t = (performance.now() - t0) / 1000;
  if (wheelGroup) {
    // Micro-movimiento de conducción (no inventa el ángulo de giro).
    wheelGroup.rotation.z = Math.sin(t * 0.9) * 0.012;
    wheelGroup.position.y = 0.80 + Math.sin(t * 2.1) * 0.002;
  }
  renderer.render(scene, camera);
}

export function actualizar(estado = {}) {
  ultimoEstado = { ...ultimoEstado, ...estado };
  pintarPantallas();
}

export function apagar() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', redimensionar);
  if (scene) {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material.dispose?.();
      }
    });
  }
  if (renderer) renderer.dispose?.();
  renderer = null; scene = null; camera = null; wheelGroup = null;
  pantallaVel = pantallaRuta = null; ctxVel = ctxRuta = null; texVel = texRuta = null;
  canvasRef = null;
}
