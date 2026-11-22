// Habitáculo GT4 del modo ADAS. Se dibuja con fondo transparente sobre la
// cámara real: la parte superior queda libre para que se vea la carretera.
import * as THREE from '/vendor/three/three.module.min.js';

let renderer = null;
let scene = null;
let camera = null;
let raf = 0;
let canvasRef = null;
let wheelGroup = null;
let t0 = performance.now();
let ultimoPintado = 0;
let estado = { velocidad: 0, marcha: 'N', distancia: 0, eta: 0, maniobra: '', calle: '', limite: 0, color: '#22d3ee' };
let firmaPantallas = '';

const pantallas = [];

// ---------------------------------------------------------------------------
// Materiales
// ---------------------------------------------------------------------------

function texturaRuido(base = '#12161c', variacion = 16, repeticiones = 4) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 5200; i++) {
    const v = Math.max(0, Math.min(255, 20 + Math.random() * variacion * 4));
    g.fillStyle = `rgba(${v},${v + 2},${v + 4},${0.10 + Math.random() * 0.16})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.4, 1.4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeticiones, repeticiones);
  t.anisotropy = 4;
  return t;
}

function texturaRejilla() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#070b10';
  g.fillRect(0, 0, 256, 256);
  const gr = g.createRadialGradient(128, 118, 10, 128, 128, 124);
  gr.addColorStop(0, '#15202a');
  gr.addColorStop(1, '#05080c');
  g.fillStyle = gr;
  g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2c3946'; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 7; i++) {
    const y = 62 + i * 20;
    const ancho = Math.sqrt(Math.max(0, 108 * 108 - (y - 128) * (y - 128)));
    const grad = g.createLinearGradient(0, y, 0, y + 11);
    grad.addColorStop(0, '#3d4b59');
    grad.addColorStop(0.5, '#1a232c');
    grad.addColorStop(1, '#070b10');
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(128 - ancho, y, ancho * 2, 12, 6);
    g.fill();
  }
  g.fillStyle = '#101820';
  g.beginPath(); g.arc(128, 128, 22, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#51606f'; g.lineWidth = 4; g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function crearPantalla(w, h, anchoTex = 512, altoTex = 256) {
  const c = document.createElement('canvas');
  c.width = anchoTex; c.height = altoTex;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  pantallas.push({ ctx, tex, tipo: '' });
  return { mesh, ctx, tex };
}

function caja(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  scene.add(m);
  return m;
}

function cilindro(r1, r2, alto, lados, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, alto, lados), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  scene.add(m);
  return m;
}

function toro(radio, tubo, mat, x, y, z, rx = 0, ry = 0, rz = 0, arco = Math.PI * 2) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radio, tubo, 12, 64, arco), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Pantallas
// ---------------------------------------------------------------------------

function marcarFirma() {
  const s = estado;
  firmaPantallas = `${Math.round(s.velocidad)}|${s.marcha}|${Math.round(s.distancia)}|${Math.round(s.eta)}|${s.maniobra}|${s.calle}|${s.limite}|${s.color}`;
}

function redondear(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pintarCuadro(p) {
  const c = p.ctx, W = c.canvas.width, H = c.canvas.height;
  const { velocidad, marcha, limite } = estado;
  c.clearRect(0, 0, W, H);
  const fondo = c.createLinearGradient(0, 0, 0, H);
  fondo.addColorStop(0, '#050b12');
  fondo.addColorStop(0.55, '#03070d');
  fondo.addColorStop(1, '#010408');
  c.fillStyle = fondo;
  c.fillRect(0, 0, W, H);

  const cx = W * 0.46, cy = H * 0.56, r = H * 0.355;
  // Pista del arco.
  c.lineWidth = H * 0.052;
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(40,66,86,0.55)';
  c.beginPath();
  c.arc(cx, cy, r, Math.PI * 0.73, Math.PI * 2.27);
  c.stroke();

  // Arco de velocidad, de azul a cian.
  const frac = Math.max(0.035, Math.min(1, Math.abs(velocidad) / 220));
  const g = c.createLinearGradient(cx - r, cy, cx + r, cy);
  g.addColorStop(0, '#0e7490');
  g.addColorStop(0.5, '#22d3ee');
  g.addColorStop(1, '#7dd3fc');
  c.strokeStyle = g;
  c.shadowColor = 'rgba(34,211,238,0.75)';
  c.shadowBlur = H * 0.055;
  c.beginPath();
  c.arc(cx, cy, r, Math.PI * 0.73, Math.PI * 0.73 + Math.PI * 1.54 * frac);
  c.stroke();
  c.shadowBlur = 0;

  // Marcas.
  for (let i = 0; i <= 27; i++) {
    const a = Math.PI * 0.73 + (Math.PI * 1.54) * (i / 27);
    const largo = i % 3 === 0 ? H * 0.055 : H * 0.028;
    const r1 = r + H * 0.055;
    c.strokeStyle = i % 3 === 0 ? 'rgba(125,211,252,0.9)' : 'rgba(90,130,155,0.55)';
    c.lineWidth = i % 3 === 0 ? 3 : 2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    c.lineTo(cx + Math.cos(a) * (r1 + largo), cy + Math.sin(a) * (r1 + largo));
    c.stroke();
  }

  // Cifra grande.
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#f2fbff';
  c.shadowColor = 'rgba(34,211,238,0.55)';
  c.shadowBlur = H * 0.04;
  c.font = `900 ${H * 0.50}px system-ui, -apple-system, sans-serif`;
  c.fillText(String(Math.round(Math.abs(velocidad))), cx, cy + H * 0.01);
  c.shadowBlur = 0;
  c.fillStyle = '#8ecae6';
  c.font = `700 ${H * 0.075}px system-ui, sans-serif`;
  c.fillText('km/h', cx, cy + H * 0.285);

  // Etiquetas.
  c.textAlign = 'left';
  c.fillStyle = '#67e8f9';
  c.font = `800 ${H * 0.075}px system-ui, sans-serif`;
  c.fillText('GT4', W * 0.035, H * 0.115);
  c.fillStyle = 'rgba(148,184,205,0.75)';
  c.font = `700 ${H * 0.048}px system-ui, sans-serif`;
  c.fillText('SPORT', W * 0.035, H * 0.185);

  // Marcha a la derecha.
  c.fillStyle = 'rgba(8,24,34,0.9)';
  redondear(c, W * 0.795, H * 0.23, W * 0.155, H * 0.47, H * 0.05);
  c.fill();
  c.strokeStyle = 'rgba(34,211,238,0.45)';
  c.lineWidth = 2;
  c.stroke();
  c.textAlign = 'center';
  c.fillStyle = '#e6fbff';
  c.font = `900 ${H * 0.30}px system-ui, sans-serif`;
  c.fillText(marcha, W * 0.8725, H * 0.47);

  // Límite.
  if (limite) {
    c.beginPath();
    c.arc(W * 0.875, H * 0.82, H * 0.085, 0, Math.PI * 2);
    c.fillStyle = '#f8fafc'; c.fill();
    c.strokeStyle = '#ef4444'; c.lineWidth = H * 0.016; c.stroke();
    c.fillStyle = '#111827';
    c.font = `900 ${H * 0.095}px system-ui, sans-serif`;
    c.fillText(String(limite), W * 0.875, H * 0.825);
  }

  // Barras inferiores.
  const yBarra = H * 0.905;
  c.fillStyle = 'rgba(90,120,140,0.22)';
  c.fillRect(W * 0.045, yBarra, W * 0.33, H * 0.018);
  c.fillRect(W * 0.625, yBarra, W * 0.33, H * 0.018);
  c.fillStyle = '#22d3ee';
  c.fillRect(W * 0.045, yBarra, W * 0.33 * 0.62, H * 0.018);
  c.fillStyle = '#fbbf24';
  c.fillRect(W * 0.625, yBarra, W * 0.33 * 0.45, H * 0.018);
  c.fillStyle = 'rgba(160,190,210,0.8)';
  c.font = `700 ${H * 0.048}px system-ui, sans-serif`;
  c.textAlign = 'left';
  c.fillText('FUEL', W * 0.045, H * 0.97);
  c.textAlign = 'right';
  c.fillText('TEMP', W * 0.955, H * 0.97);
}

function pintarNavegador(p) {
  const c = p.ctx, W = c.canvas.width, H = c.canvas.height;
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#041019';
  c.fillRect(0, 0, W, H);

  // Rejilla de mapa.
  c.strokeStyle = 'rgba(56,189,248,0.10)';
  c.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const y = H * (0.20 + i * i * 0.009);
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = W * (0.06 + i * 0.11);
    c.beginPath(); c.moveTo(x, H * 0.16); c.lineTo(x, H); c.stroke();
  }

  // Carretera en perspectiva.
  const horizonte = H * 0.30;
  const g = c.createLinearGradient(0, horizonte, 0, H);
  g.addColorStop(0, 'rgba(14,116,144,0.20)');
  g.addColorStop(1, 'rgba(34,211,238,0.16)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(W * 0.43, horizonte);
  c.lineTo(W * 0.57, horizonte);
  c.lineTo(W * 0.90, H);
  c.lineTo(W * 0.10, H);
  c.closePath();
  c.fill();

  c.strokeStyle = '#22d3ee';
  c.shadowColor = 'rgba(34,211,238,0.9)';
  c.shadowBlur = 10;
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(W * 0.43, horizonte); c.lineTo(W * 0.10, H); c.stroke();
  c.beginPath(); c.moveTo(W * 0.57, horizonte); c.lineTo(W * 0.90, H); c.stroke();
  c.shadowBlur = 0;

  // Flechas de ruta.
  c.fillStyle = 'rgba(125,211,252,0.92)';
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const y = horizonte + (H - horizonte) * (0.28 + t * 0.55);
    const ancho = 6 + t * 26;
    c.beginPath();
    c.moveTo(W * 0.5, y - ancho * 0.75);
    c.lineTo(W * 0.5 - ancho * 0.65, y + ancho * 0.25);
    c.lineTo(W * 0.5, y - ancho * 0.05);
    c.lineTo(W * 0.5 + ancho * 0.65, y + ancho * 0.25);
    c.closePath();
    c.fill();
  }

  // Destino.
  c.fillStyle = '#fbbf24';
  c.beginPath();
  c.arc(W * 0.5, horizonte - H * 0.045, W * 0.035, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#0b1220';
  c.font = `900 ${W * 0.045}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('A', W * 0.5, horizonte - H * 0.043);

  // Cabecera.
  c.fillStyle = 'rgba(2,10,16,0.94)';
  c.fillRect(0, 0, W, H * 0.16);
  c.fillStyle = '#67e8f9';
  c.font = `800 ${H * 0.065}px system-ui, sans-serif`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText('GT4 · NAV', W * 0.04, H * 0.08);
  c.fillStyle = '#22d3ee';
  c.textAlign = 'right';
  c.fillText('LIVE', W * 0.96, H * 0.08);
  c.fillStyle = '#fbbf24';
  c.fillRect(W * 0.04, H * 0.155, W * 0.92, 2);

  // Pie con la calle y la distancia reales.
  c.fillStyle = 'rgba(2,10,16,0.92)';
  c.fillRect(0, H * 0.80, W, H * 0.20);
  c.fillStyle = '#e6fbff';
  c.font = `800 ${H * 0.075}px system-ui, sans-serif`;
  c.textAlign = 'left';
  c.fillText((estado.calle || 'Sin ruta').slice(0, 22), W * 0.045, H * 0.875);
  c.fillStyle = '#22d3ee';
  c.font = `900 ${H * 0.085}px system-ui, sans-serif`;
  c.textAlign = 'right';
  const d = estado.distancia || 0;
  c.fillText(d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`, W * 0.955, H * 0.875);
  c.fillStyle = 'rgba(148,184,205,0.8)';
  c.font = `700 ${H * 0.05}px system-ui, sans-serif`;
  c.textAlign = 'left';
  c.fillText(`${Math.round(estado.eta || 0)} min`, W * 0.045, H * 0.955);
}

function pintarClima(p) {
  const c = p.ctx, W = c.canvas.width, H = c.canvas.height;
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#050b11';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(56,225,255,0.18)';
  c.lineWidth = 2;
  c.strokeRect(1, 1, W - 2, H - 2);

  for (const [x, temp] of [[W * 0.24, '22.0'], [W * 0.76, '22.0']]) {
    c.beginPath();
    c.arc(x, H * 0.52, H * 0.27, 0, Math.PI * 2);
    c.fillStyle = '#0b141c'; c.fill();
    c.strokeStyle = 'rgba(56,225,255,0.7)'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#e6fbff';
    c.font = `800 ${H * 0.19}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(temp, x, H * 0.53);
    c.fillStyle = '#22d3ee';
    c.font = `700 ${H * 0.13}px system-ui, sans-serif`;
    c.fillText('°C', x + H * 0.22, H * 0.42);
  }

  c.fillStyle = 'rgba(56,225,255,0.75)';
  c.font = `700 ${H * 0.12}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.fillText('AUTO', W * 0.5, H * 0.28);
  for (let i = 0; i < 4; i++) {
    const x = W * (0.40 + i * 0.065);
    c.fillStyle = i === 0 ? '#fbbf24' : 'rgba(90,130,150,0.55)';
    c.fillRect(x, H * 0.68, W * 0.040, H * 0.08);
  }
}

function pintarBadge(p) {
  const c = p.ctx, W = c.canvas.width, H = c.canvas.height;
  c.clearRect(0, 0, W, H);
  c.save();
  c.translate(W / 2, H / 2);
  // Escudo amarillo con borde negro.
  c.beginPath();
  c.moveTo(0, -H * 0.42);
  c.bezierCurveTo(W * 0.34, -H * 0.36, W * 0.40, -H * 0.08, W * 0.30, H * 0.18);
  c.bezierCurveTo(W * 0.20, H * 0.40, W * 0.06, H * 0.46, 0, H * 0.48);
  c.bezierCurveTo(-W * 0.06, H * 0.46, -W * 0.20, H * 0.40, -W * 0.30, H * 0.18);
  c.bezierCurveTo(-W * 0.40, -H * 0.08, -W * 0.34, -H * 0.36, 0, -H * 0.42);
  c.closePath();
  c.fillStyle = '#fbbf24';
  c.fill();
  c.strokeStyle = '#080c10';
  c.lineWidth = W * 0.055;
  c.stroke();
  c.fillStyle = '#080c10';
  c.font = `900 ${H * 0.30}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('GT4', 0, H * 0.04);
  c.restore();
}

function pintarPantallas() {
  for (const p of pantallas) {
    if (p.tipo === 'velocidad') pintarCuadro(p);
    else if (p.tipo === 'ruta') pintarNavegador(p);
    else if (p.tipo === 'clima') pintarClima(p);
    else if (p.tipo === 'badge') pintarBadge(p);
    else continue;
    p.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Montaje
// ---------------------------------------------------------------------------

export function montar(canvas) {
  if (!canvas || renderer) return;
  canvasRef = canvas;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.30;

  scene = new THREE.Scene();
  // Campo de visión amplio: entran las dos salidas de aire, el volante y parte
  // de las puertas, y el parabrisas se queda con más superficie de cámara real.
  camera = new THREE.PerspectiveCamera(78, w / h, 0.03, 24);
  camera.position.set(0, 1.30, 0.72);
  camera.lookAt(0, 1.16, -1.7);

  scene.add(new THREE.AmbientLight(0x6d8094, 1.75));
  scene.add(new THREE.HemisphereLight(0x9dbcd8, 0x0a0d12, 1.15));
  const relleno = new THREE.PointLight(0xcfe4f2, 1.0, 4.2, 2);
  relleno.position.set(0, 1.55, 0.35);
  scene.add(relleno);
  const cyan = new THREE.PointLight(0x22d3ee, 2.1, 3.4, 2);
  cyan.position.set(-0.55, 1.16, -0.48);
  scene.add(cyan);
  const ambar = new THREE.PointLight(0xffb020, 0.85, 2.4, 2);
  ambar.position.set(0.62, 0.86, -0.52);
  scene.add(ambar);
  const panel = new THREE.PointLight(0x9adfff, 1.5, 1.8, 2);
  panel.position.set(0, 1.06, -0.60);
  scene.add(panel);

  const ruido = texturaRuido();
  const matAlcantara = new THREE.MeshStandardMaterial({ map: ruido, color: 0x4a525c, roughness: 0.98, metalness: 0.02 });
  const matCuero = new THREE.MeshStandardMaterial({ map: ruido, color: 0x2f3741, roughness: 0.88, metalness: 0.06 });
  const matCueroClaro = new THREE.MeshStandardMaterial({ map: ruido, color: 0x46505b, roughness: 0.92, metalness: 0.04 });
  const matTablero = new THREE.MeshStandardMaterial({ map: ruido, color: 0x242c35, roughness: 0.9, metalness: 0.08 });
  const matNegroPiano = new THREE.MeshStandardMaterial({ color: 0x04070b, roughness: 0.18, metalness: 0.45 });
  const matCromo = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.24, metalness: 0.95 });
  const matCromoOscuro = new THREE.MeshStandardMaterial({ color: 0x4a5561, roughness: 0.32, metalness: 0.85 });
  const matAmarillo = new THREE.MeshStandardMaterial({ color: 0xd9a514, roughness: 0.55, metalness: 0.12, emissive: 0x3a2600, emissiveIntensity: 0.55 });
  const matCyan = new THREE.MeshStandardMaterial({ color: 0x062b33, emissive: 0x22d3ee, emissiveIntensity: 2.4, roughness: 0.35 });
  const matAmbar = new THREE.MeshStandardMaterial({ color: 0x2a1503, emissive: 0xffa51f, emissiveIntensity: 1.2, roughness: 0.5 });
  const matHilo = new THREE.MeshStandardMaterial({ color: 0x8a6714, roughness: 0.72, metalness: 0.08, emissive: 0x241700, emissiveIntensity: 0.4 });
  const matRejilla = new THREE.MeshBasicMaterial({ map: texturaRejilla() });
  const matCristal = new THREE.MeshStandardMaterial({ color: 0x0b1620, roughness: 0.08, metalness: 0.65 });
  const matGoma = new THREE.MeshStandardMaterial({ color: 0x090c10, roughness: 1, metalness: 0.02 });

  // --- Salpicadero --------------------------------------------------------
  caja(2.18, 0.14, 0.62, matTablero, 0, 0.875, -1.06, -0.055);
  caja(2.08, 0.26, 0.09, matCuero, 0, 0.79, -0.79, 0.08);
  caja(1.98, 0.30, 0.48, matCueroClaro, 0, 0.57, -0.86, -0.04);
  caja(1.86, 0.08, 0.30, matCuero, 0, 0.44, -0.72, -0.18);

  // Hombro central del salpicadero (Sport Chrono).
  caja(0.56, 0.055, 0.30, matTablero, 0, 1.005, -0.99, -0.08);
  const reloj = crearPantalla(0.082, 0.082, 160, 160);
  reloj.mesh.position.set(0, 1.038, -0.955);
  reloj.mesh.rotation.x = -0.90;
  reloj.mesh.name = 'reloj';
  // El reloj se pinta aparte para no competir con las pantallas dinámicas.
  {
    const c = reloj.ctx;
    c.fillStyle = '#05090e'; c.fillRect(0, 0, 160, 160);
    c.strokeStyle = 'rgba(56,225,255,.55)'; c.lineWidth = 3;
    c.beginPath(); c.arc(80, 80, 66, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#fbbf24'; c.font = '900 40px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('0:00', 80, 82);
    c.fillStyle = '#67e8f9'; c.font = '700 16px system-ui, sans-serif'; c.fillText('LAP', 80, 120);
    reloj.tex.needsUpdate = true;
  }
  scene.add(reloj.mesh);

  // Filetes amarillos y luz ambiental azul.
  caja(1.60, 0.005, 0.006, matHilo, 0, 0.902, -0.748);
  caja(1.90, 0.007, 0.008, matCromoOscuro, 0, 0.795, -0.752);
  caja(2.02, 0.032, 0.44, matCuero, 0, 0.952, -1.02, -0.05);
  caja(1.92, 0.010, 0.016, matCyan, 0, 0.915, -0.965);
  caja(1.80, 0.008, 0.014, matAmbar, 0, 0.575, -0.935);

  // --- Cuadro de instrumentos ---------------------------------------------
  caja(0.59, 0.27, 0.055, matNegroPiano, 0, 1.105, -0.735, -0.105);
  caja(0.67, 0.048, 0.25, matCuero, 0, 1.247, -0.76, -0.16); // visera
  caja(0.60, 0.010, 0.012, matCromoOscuro, 0, 1.210, -0.658);
  const cuadro = crearPantalla(0.505, 0.195, 840, 330);
  cuadro.mesh.position.set(0, 1.105, -0.703);
  cuadro.mesh.rotation.x = -0.105;
  cuadro.mesh.name = 'cuadro';
  pantallas[pantallas.length - 1].tipo = 'velocidad';
  scene.add(cuadro.mesh);

  // --- Salidas de aire redondas -------------------------------------------
  function salidaAire(x, y, z, radio, giro = 0) {
    toro(radio, radio * 0.13, matNegroPiano, x, y, z, 0, giro, 0);
    toro(radio * 1.06, radio * 0.032, matCyan, x, y, z + 0.004, 0, giro, 0);
    const disco = new THREE.Mesh(new THREE.CircleGeometry(radio * 0.885, 40), matRejilla);
    disco.position.set(x, y, z + 0.002);
    disco.rotation.y = giro;
    scene.add(disco);
  }
  salidaAire(-0.455, 1.065, -0.735, 0.078);
  salidaAire(0.455, 1.065, -0.735, 0.078);
  salidaAire(-0.81, 1.00, -0.70, 0.058);
  salidaAire(0.81, 1.00, -0.70, 0.058);

  // --- Volante ------------------------------------------------------------
  wheelGroup = new THREE.Group();
  wheelGroup.position.set(0, 0.790, -0.275);
  wheelGroup.rotation.x = -0.235;
  scene.add(wheelGroup);

  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.220, 0.036, 18, 80), matAlcantara);
  aro.scale.y = 0.97;
  wheelGroup.add(aro);

  // Franja amarilla a las 12.
  const franja = new THREE.Mesh(
    new THREE.TorusGeometry(0.220, 0.0372, 10, 28, 0.34),
    matAmarillo
  );
  franja.rotation.z = Math.PI / 2 - 0.17;
  franja.scale.y = 0.97;
  wheelGroup.add(franja);

  // Costura amarilla por dentro del aro.
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    if (Math.abs(Math.sin(a / 2)) < 0.10) continue;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.0035, 0.004), matAmarillo);
    s.position.set(Math.cos(a) * 0.189, Math.sin(a) * 0.184, 0.015);
    s.rotation.z = a + Math.PI / 2;
    wheelGroup.add(s);
  }

  // Radios: izquierda, derecha e inferior.
  for (const lado of [-1, 1]) {
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.048, 0.034), matNegroPiano);
    radio.position.set(lado * 0.110, -0.002, 0.006);
    wheelGroup.add(radio);
    const filo = new THREE.Mesh(new THREE.BoxGeometry(0.130, 0.0035, 0.004), matCromoOscuro);
    filo.position.set(lado * 0.110, 0.025, 0.024);
    wheelGroup.add(filo);

    // Mando redondo con botones.
    const mando = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.026, 28), matNegroPiano);
    mando.rotation.x = Math.PI / 2;
    mando.position.set(lado * 0.112, 0.004, 0.033);
    wheelGroup.add(mando);
    for (let b = 0; b < 3; b++) {
      const boton = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 12),
        b === 0 ? matCyan : b === 1 ? matAmarillo : matCromo
      );
      boton.rotation.x = Math.PI / 2;
      boton.position.set(lado * (0.070 + b * 0.016), -0.012, 0.045);
      wheelGroup.add(boton);
    }
  }
  const radioAbajo = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.150, 0.030), matNegroPiano);
  radioAbajo.position.set(0, -0.120, 0.006);
  wheelGroup.add(radioAbajo);
  const filoAbajo = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.138, 0.004), matCromoOscuro);
  filoAbajo.position.set(0, -0.120, 0.022);
  wheelGroup.add(filoAbajo);

  // Buje y escudo.
  const buje = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.034, 30), matAlcantara);
  buje.rotation.x = Math.PI / 2;
  buje.position.z = 0.020;
  wheelGroup.add(buje);
  const anilloBuje = new THREE.Mesh(new THREE.TorusGeometry(0.059, 0.004, 8, 32), matCromoOscuro);
  anilloBuje.position.z = 0.040;
  wheelGroup.add(anilloBuje);
  const badge = crearPantalla(0.070, 0.070, 200, 200);
  badge.mesh.position.set(0, 0, 0.046);
  pantallas[pantallas.length - 1].tipo = 'badge';
  scene.add(badge.mesh);
  wheelGroup.add(badge.mesh);

  // Levas.
  for (const lado of [-1, 1]) {
    const leva = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.115, 0.010), matCromoOscuro);
    leva.position.set(lado * 0.275, 0.004, -0.040);
    leva.rotation.z = lado * 0.14;
    wheelGroup.add(leva);
  }

  cilindro(0.052, 0.078, 0.32, 20, matNegroPiano, 0, 0.70, -0.68, Math.PI / 2, 0, 0);

  // --- Consola central ----------------------------------------------------
  caja(0.38, 0.26, 0.24, matTablero, 0.36, 0.55, -0.63, -0.28);
  const consola = crearPantalla(0.295, 0.182, 600, 380);
  consola.mesh.position.set(0.430, 0.785, -0.600);
  consola.mesh.rotation.x = -0.22;
  consola.mesh.rotation.y = 0.09;
  consola.mesh.name = 'consola';
  pantallas[pantallas.length - 1].tipo = 'ruta';
  scene.add(consola.mesh);
  caja(0.325, 0.210, 0.016, matNegroPiano, 0.430, 0.785, -0.613, -0.22, 0.09, 0);

  const clima = crearPantalla(0.280, 0.075, 560, 150);
  clima.mesh.position.set(0.415, 0.635, -0.575);
  clima.mesh.rotation.x = -0.44;
  clima.mesh.rotation.y = 0.06;
  pantallas[pantallas.length - 1].tipo = 'clima';
  scene.add(clima.mesh);
  caja(0.300, 0.090, 0.012, matNegroPiano, 0.415, 0.635, -0.587, -0.44, 0.06, 0);

  // Mandos físicos bajo la pantalla del clima.
  for (const x of [0.370, 0.520]) {
    cilindro(0.018, 0.018, 0.016, 20, matCromo, x, 0.575, -0.532, Math.PI / 2, 0, 0);
    cilindro(0.010, 0.010, 0.019, 16, matNegroPiano, x, 0.575, -0.530, Math.PI / 2, 0, 0);
  }

  // Túnel y palanca.
  caja(0.36, 0.16, 0.75, matCuero, 0.30, 0.405, -0.50, 0.02);
  caja(0.30, 0.020, 0.020, matAmarillo, 0.30, 0.490, -0.54);
  const fuelle = cilindro(0.032, 0.062, 0.115, 20, matGoma, 0.30, 0.535, -0.41);
  const varilla = cilindro(0.010, 0.012, 0.13, 14, matCromo, 0.30, 0.620, -0.41, 0.10, 0, 0);
  const pomo = new THREE.Mesh(new THREE.SphereGeometry(0.042, 22, 16), matGoma);
  pomo.scale.set(1, 1.12, 1);
  pomo.position.set(0.30, 0.695, -0.415);
  scene.add(pomo);
  const tapaPomo = new THREE.Mesh(
    new THREE.SphereGeometry(0.030, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a1414, roughness: 0.55, metalness: 0.1 })
  );
  tapaPomo.scale.set(1, 0.55, 1);
  tapaPomo.position.set(0.30, 0.735, -0.415);
  scene.add(tapaPomo);
  const aroPomo = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.004, 8, 24), matAmarillo);
  aroPomo.rotation.x = Math.PI / 2;
  aroPomo.position.set(0.30, 0.668, -0.415);
  scene.add(aroPomo);

  // Botonera del túnel y botón de arranque rojo.
  for (let i = 0; i < 3; i++) {
    caja(0.035, 0.008, 0.016, i === 1 ? matAmbar : matCromoOscuro, 0.18 + i * 0.042, 0.500, -0.58);
  }
  const arranque = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.019, 0.012, 24),
    new THREE.MeshStandardMaterial({ color: 0x7f1010, emissive: 0xd11a1a, emissiveIntensity: 0.85, roughness: 0.4 })
  );
  arranque.rotation.x = Math.PI / 2;
  arranque.position.set(0.185, 0.555, -0.535);
  scene.add(arranque);
  const aroArranque = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.003, 8, 24), matCromo);
  aroArranque.position.set(0.185, 0.555, -0.529);
  scene.add(aroArranque);

  // --- Puertas y pilares --------------------------------------------------
  for (const lado of [-1, 1]) {
    const puerta = caja(0.10, 0.62, 0.86, matCueroClaro, lado * 0.945, 0.63, -0.40, 0, lado * -0.06, 0);
    puerta.rotation.z = lado * -0.02;
    caja(0.11, 0.09, 0.38, matCuero, lado * 0.905, 0.52, -0.26);
    caja(0.012, 0.015, 0.62, matAmarillo, lado * 0.884, 0.845, -0.45);
    caja(0.010, 0.010, 0.54, matCyan, lado * 0.880, 0.70, -0.50);
    // Altavoz/ventilación redondo junto al pilar.
    toro(0.040, 0.008, matNegroPiano, lado * 0.886, 0.955, -0.72, 0, lado * Math.PI / 2, 0);
    toro(0.043, 0.003, matCyan, lado * 0.882, 0.955, -0.72, 0, lado * Math.PI / 2, 0);
    // Pilar A inclinado hacia dentro.
    caja(0.085, 1.52, 0.12, matCuero, lado * 0.88, 1.40, -0.95, 0, 0, lado * 0.23);
    // Tirador.
    caja(0.025, 0.025, 0.18, matCromoOscuro, lado * 0.890, 0.78, -0.30);
  }

  // Moldura superior del parabrisas y espejo retrovisor.
  caja(1.92, 0.075, 0.20, matCuero, 0, 2.38, -1.02, -0.04);
  const espejo = new THREE.Group();
  espejo.position.set(0, 2.23, -0.97);
  scene.add(espejo);
  const carcasa = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.078, 0.042), matNegroPiano);
  carcasa.rotation.x = 0.10;
  espejo.add(carcasa);
  const cristal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.215, 0.052),
    new THREE.MeshBasicMaterial({ color: 0x2c4c63 })
  );
  cristal.position.z = 0.025;
  cristal.rotation.x = 0.10;
  espejo.add(cristal);
  const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.11, 12), matNegroPiano);
  pie.position.set(0, 0.085, -0.01);
  espejo.add(pie);

  // --- Suelo y mampara ----------------------------------------------------
  caja(1.74, 0.06, 1.25, matCuero, 0, 0.31, -0.64);
  caja(1.76, 0.52, 0.06, matNegroPiano, 0, 0.53, -0.91, -0.10);
  for (const x of [-0.15, 0.15]) {
    const pedal = caja(0.085, 0.17, 0.025, matCromoOscuro, x, 0.44, -0.80, -0.32);
    pedal.rotation.z = 0.02;
  }
  caja(0.26, 0.05, 0.34, matCuero, -0.46, 0.33, -0.35); // reposapiés

  marcarFirma();
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

function bucle(now = 0) {
  raf = requestAnimationFrame(bucle);
  if (!renderer || !scene || !camera) return;
  if (now - ultimoPintado < 33) return;
  ultimoPintado = now;
  const t = (now - t0) / 1000;
  if (wheelGroup) {
    // Micro-movimiento de suspensión: no inventa el giro del volante.
    wheelGroup.rotation.z = Math.sin(t * 0.9) * 0.008;
    wheelGroup.position.y = 0.790 + Math.sin(t * 2.1) * 0.0015;
  }
  renderer.render(scene, camera);
}

export function actualizar(datos = {}) {
  estado = { ...estado, ...datos };
  const firma = `${Math.round(estado.velocidad)}|${estado.marcha}|${Math.round(estado.distancia)}|${Math.round(estado.eta)}|${estado.maniobra}|${estado.calle}|${estado.limite}|${estado.color}`;
  if (firma === firmaPantallas) return;
  firmaPantallas = firma;
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
  renderer?.dispose?.();
  renderer = null; scene = null; camera = null; wheelGroup = null;
  canvasRef = null;
  pantallas.length = 0;
  firmaPantallas = '';
}
