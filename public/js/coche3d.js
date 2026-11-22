// GT4 exterior en 3D para el modo de navegación.
// Usa el mismo modelo Golf R 75 que la portada, sin sustituirlo.
import * as THREE from '/vendor/three/three.module.min.js';
import { GLTFLoader } from '/vendor/three/loaders/GLTFLoader.js';
import { DRACOLoader } from '/vendor/three/loaders/DRACOLoader.js';

let renderer = null;
let scene = null;
let camera = null;
let grupo = null;
let modelo = null;
let canvasRef = null;
let raf = 0;
let activo = false;
let cargado = false;
let ultimo = 0;
let t0 = performance.now();
let cssW = 0;
let cssH = 0;
let ro = null;
let dpr = 1;
const estado = { giro: 0, velocidad: 0 };
let giroSuave = 0;

function tamano() {
  if (!canvasRef) return { w: 0, h: 0 };
  const w = canvasRef.clientWidth || window.innerWidth;
  const h = canvasRef.clientHeight || window.innerHeight;
  return { w, h };
}

function ajustar() {
  if (!renderer || !canvasRef) return;
  const { w, h } = tamano();
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  cssW = w; cssH = h;
  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

export function montar(canvas, onListo) {
  if (!canvas) return false;
  canvasRef = canvas;
  if (renderer) {
    ajustar();
    activo = true;
    if (cargado) onListo?.();
    return true;
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (_e) {
    return false;
  }
  const compacto = window.matchMedia('(max-width: 700px)').matches;
  dpr = Math.min(window.devicePixelRatio || 1, compacto ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  // Detrás y algo elevada: se ve el coche desde el exterior trasero, como en
  // la referencia, pero integrado en la carretera que dibuja el GPS.
  camera.position.set(0, 2.05, 11);
  camera.lookAt(0, 2.4, 0);

  scene.add(new THREE.HemisphereLight(0x9fc7ff, 0x0a0a12, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(2.6, 5.2, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(compacto ? 1024 : 2048, compacto ? 1024 : 2048);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 18;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  scene.add(key);

  const rimCyan = new THREE.SpotLight(0x22d3ee, 34, 16, Math.PI / 4.5, 0.5, 1.6);
  rimCyan.position.set(-3.2, 1.9, 2.4);
  rimCyan.target.position.set(0, 0.6, 0);
  scene.add(rimCyan, rimCyan.target);
  const rimViolet = new THREE.PointLight(0x8b5cf6, 16, 12, 2);
  rimViolet.position.set(3.0, 1.5, -1.8);
  scene.add(rimViolet);
  const under = new THREE.PointLight(0x22d3ee, 4, 5, 2);
  under.position.set(0, 0.3, 0.2);
  scene.add(under);

  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 3.8),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.52 })
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.002;
  sombra.receiveShadow = true;
  scene.add(sombra);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 48),
    new THREE.MeshBasicMaterial({ color: 0x1f8fff, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.004;
  scene.add(halo);

  grupo = new THREE.Group();
  scene.add(grupo);

  const draco = new DRACOLoader();
  draco.setDecoderPath('/vendor/three/libs/draco/gltf/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load('/models/golf-r-75.glb', gltf => {
    modelo = gltf.scene;
    const caja = new THREE.Box3().setFromObject(modelo);
    const centro = caja.getCenter(new THREE.Vector3());
    const size = caja.getSize(new THREE.Vector3());
    // El GLB viene en unidades de ~1 cm: 167 x 57 x 79. Se normaliza por el
    // ancho real (79 unidades) para que el coche mida 1,82 m y no 0,91 m.
    const escala = 1.55 / Math.max(1, size.z);
    modelo.scale.setScalar(escala);
    modelo.position.set(-centro.x * escala, -caja.min.y * escala, -centro.z * escala);
    modelo.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (!m) return;
        m.envMapIntensity = 0.9;
        if (m.name === 'paint') {
          m.roughness = 0.22;
          m.metalness = 0.55;
          m.clearcoat = 1;
          m.clearcoatRoughness = 0.16;
        }
        if (m.name === 'rear-indicator') {
          m.emissive = new THREE.Color(0xff2d00);
          m.emissiveIntensity = 1.1;
        }
        if (m.name === 'glass') {
          m.transparent = true;
          m.opacity = 0.9;
        }
      });
    });
    // El modelo de la portada mira hacia el visitante; para la navegación se
    // gira para que el jugador vea la zaga y el alerón.
    grupo.rotation.y = -Math.PI / 2;
    grupo.add(modelo);
    cargado = true;
    window.__coche3dListo = true;
    ajustar();
    onListo?.();
  }, undefined, err => {
    console.warn('No se pudo cargar el GT4 3D:', err);
  });

  activo = true;
  bucle();
  requestAnimationFrame(ajustar);
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => ajustar());
    ro.observe(canvas);
  }
  window.addEventListener('resize', ajustar, { passive: true });
  return true;
}

function bucle(now = 0) {
  raf = requestAnimationFrame(bucle);
  if (!renderer || !scene || !camera || !activo) return;
  if (canvasRef && (canvasRef.clientWidth !== cssW || canvasRef.clientHeight !== cssH)) ajustar();
  if (now - ultimo < 33) return;
  ultimo = now;
  const t = (now - t0) / 1000;
  giroSuave += (estado.giro - giroSuave) * 0.08;
  if (grupo) {
    // Balanceo de carrocería muy leve: no inventa el ángulo de giro, solo
    // acompaña la curva que ya marca la ruta.
    grupo.rotation.z = Math.max(-0.06, Math.min(0.06, giroSuave * 0.012));
    grupo.rotation.x = Math.max(-0.02, Math.min(0.02, estado.velocidad / 9000));
    grupo.position.y = Math.sin(t * 2.4) * 0.004;
  }
  renderer.render(scene, camera);
}

export function actualizar(datos = {}) {
  if (Number.isFinite(datos.giro)) estado.giro = datos.giro;
  if (Number.isFinite(datos.velocidad)) estado.velocidad = datos.velocidad;
}

export function activar(v = true) {
  activo = Boolean(v);
  if (activo) ajustar();
}

export function estaListo() {
  return cargado;
}

export function capturar() {
  if (!renderer || !scene || !camera || !canvasRef) return null;
  renderer.render(scene, camera);
  return canvasRef.toDataURL('image/png');
}

export function apagar() {
  activo = false;
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', ajustar);
  ro?.disconnect();
  ro = null;
  if (scene) {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material.dispose?.();
      }
    });
  }
  renderer?.dispose?.();
  renderer = null;
  scene = null;
  camera = null;
  grupo = null;
  modelo = null;
  cargado = false;
  canvasRef = null;
}
