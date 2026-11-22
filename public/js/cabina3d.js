// Habitáculo GT4 del modo ADAS. Se dibuja con fondo transparente sobre la
// cámara real: el parabrisas queda libre y la carretera la pone el teléfono.
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

function texturaCarbono() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0e14';
  g.fillRect(0, 0, 128, 128);
  for (let i = -128; i < 128; i += 10) {
    g.strokeStyle = i % 20 === 0 ? '#18202b' : '#111821';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.4, 2.4);
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
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  pantallas.push({ ctx, tex, tipo: '' });
  return { mesh, ctx, tex };
}

function marcarFirma() {
  const s = estado;
  firmaPantallas = `${Math.round(s.velocidad)}|${s.marcha}|${Math.round(s.distancia)}|${Math.round(s.eta)}|${s.maniobra}|${s.calle}|${s.limite}|${s.color}`;
}

function pintarPantallas() {
  const { velocidad, marcha, distancia, eta, maniobra, calle, limite, color } = estado;
  for (const p of pantallas) {
    if (!p.tipo) continue; // logotipos y placas fijas
    const c = p.ctx;
    const W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    if (p.tipo === 'velocidad') {
      const fondo = c.createLinearGradient(0, 0, 0, H);
      fondo.addColorStop(0, '#07111c');
      fondo.addColorStop(0.55, '#050b13');
      fondo.addColorStop(1, '#02060b');
      c.fillStyle = fondo;
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(56,225,255,0.28)';
      c.lineWidth = 4;
      c.strokeRect(3, 3, W - 6, H - 6);
      // Marcas laterales del cuadro.
      c.strokeStyle = 'rgba(120,190,225,0.35)';
      c.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const x = W * 0.08 + i * W * 0.028;
        c.beginPath(); c.moveTo(x, H * 0.16); c.lineTo(x, H * 0.16 + (i % 3 === 0 ? 12 : 7)); c.stroke();
      }
      c.fillStyle = '#7fd8ff';
      c.font = `800 ${H * 0.085}px system-ui, sans-serif`;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText('GT4', W * 0.055, H * 0.12);
      c.fillStyle = color;
      c.font = `900 ${H * 0.46}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.fillText(String(Math.round(velocidad)), W * 0.42, H * 0.51);
      c.fillStyle = '#9fd8ff';
      c.font = `700 ${H * 0.09}px system-ui, sans-serif`;
      c.fillText('KM/H', W * 0.42, H * 0.79);
      // Marcha en caja propia.
      c.fillStyle = 'rgba(56,225,255,0.10)';
      c.fillRect(W * 0.76, H * 0.22, W * 0.18, H * 0.56);
      c.strokeStyle = 'rgba(56,225,255,0.35)';
      c.lineWidth = 2;
      c.strokeRect(W * 0.76, H * 0.22, W * 0.18, H * 0.56);
      c.fillStyle = '#eaf7ff';
      c.font = `900 ${H * 0.34}px system-ui, sans-serif`;
      c.fillText(marcha, W * 0.85, H * 0.50);
      // Barra de revoluciones decorativa, sin inventar lecturas del motor.
      const rpm = 0.18 + (Math.min(140, velocidad) / 140) * 0.55;
      c.fillStyle = 'rgba(56,225,255,0.16)';
      c.fillRect(W * 0.055, H * 0.885, W * 0.885, H * 0.035);
      const grad = c.createLinearGradient(W * 0.055, 0, W * 0.94, 0);
      grad.addColorStop(0, '#22d3ee');
      grad.addColorStop(0.7, '#38e1ff');
      grad.addColorStop(1, '#fbbf24');
      c.fillStyle = grad;
      c.fillRect(W * 0.055, H * 0.885, W * 0.885 * rpm, H * 0.035);
      if (limite) {
        c.fillStyle = '#f8fafc';
        c.beginPath(); c.arc(W * 0.93, H * 0.15, H * 0.085, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#dc2626'; c.lineWidth = H * 0.018; c.stroke();
        c.fillStyle = '#0f172a';
        c.font = `900 ${H * 0.1}px system-ui, sans-serif`;
        c.textAlign = 'center';
        c.fillText(String(limite), W * 0.93, H * 0.155);
      }
    } else if (p.tipo === 'ruta') {
      c.fillStyle = 'rgba(3,7,12,0.94)';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(56,225,255,0.3)';
      c.lineWidth = 4;
      c.strokeRect(2, 2, W - 4, H - 4);
      c.fillStyle = color;
      c.font = `900 ${H * 0.28}px system-ui, sans-serif`;
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText('➜', W * 0.04, H * 0.08);
      c.fillStyle = '#eaf7ff';
      c.font = `800 ${H * 0.12}px system-ui, sans-serif`;
      c.fillText((maniobra || 'Sin ruta activa').slice(0, 18), W * 0.19, H * 0.13);
      c.fillStyle = '#8fd6ff';
      c.font = `700 ${H * 0.105}px system-ui, sans-serif`;
      c.fillText(calle ? calle.slice(0, 20) : 'Sin destino', W * 0.19, H * 0.36);
      c.fillStyle = '#f0f8ff';
      c.font = `900 ${H * 0.2}px system-ui, sans-serif`;
      c.textAlign = 'right';
      c.fillText(distancia >= 1000 ? `${(distancia / 1000).toFixed(1)} km` : `${Math.round(distancia)} m`, W * 0.96, H * 0.6);
      c.fillStyle = 'rgba(160,200,230,0.85)';
      c.font = `700 ${H * 0.1}px system-ui, sans-serif`;
      c.fillText(`${Math.round(eta)} min`, W * 0.96, H * 0.82);
    }
    p.tex.needsUpdate = true;
  }
}

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
  renderer.toneMappingExposure = 1.08;

  scene = new THREE.Scene();
  // Cámara desde los ojos del conductor: el capó y el cuadro quedan abajo y el
  // parabrisas libre arriba para la imagen real de la cámara.
  camera = new THREE.PerspectiveCamera(64, w / h, 0.03, 24);
  camera.position.set(0, 1.29, 0.88);
  camera.lookAt(0, 1.21, -1.7);

  scene.add(new THREE.AmbientLight(0x2a3442, 1.1));
  scene.add(new THREE.HemisphereLight(0x4b6b8f, 0x05070a, 0.75));
  const cyan = new THREE.PointLight(0x22d3ee, 1.5, 3.2, 2);
  cyan.position.set(-0.62, 1.18, -0.35);
  scene.add(cyan);
  const ambar = new THREE.PointLight(0xffb020, 1.5, 3, 2);
  ambar.position.set(0.65, 0.85, -0.55);
  scene.add(ambar);
  const luzCuadro = new THREE.PointLight(0x9adfff, 1.2, 1.6, 2);
  luzCuadro.position.set(0, 1.03, -0.62);
  scene.add(luzCuadro);

  const carbono = texturaCarbono();
  const matCuero = new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.82, metalness: 0.18 });
  const matCueroSuave = new THREE.MeshStandardMaterial({ color: 0x1c232d, roughness: 0.9, metalness: 0.08 });
  const matCarbono = new THREE.MeshStandardMaterial({ map: carbono, roughness: 0.4, metalness: 0.62 });
  const matTablero = new THREE.MeshStandardMaterial({ color: 0x0b1017, roughness: 0.86, metalness: 0.16 });
  const matCromo = new THREE.MeshStandardMaterial({ color: 0x8d9aa8, roughness: 0.22, metalness: 0.95 });
  const matNegroPiano = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.16, metalness: 0.4 });
  const matCyan = new THREE.MeshStandardMaterial({ color: 0x062b33, emissive: 0x22d3ee, emissiveIntensity: 2.2, roughness: 0.4 });
  const matAmbar = new THREE.MeshStandardMaterial({ color: 0x2a1503, emissive: 0xffa51f, emissiveIntensity: 1.8, roughness: 0.5 });

  // --- Salpicadero ---------------------------------------------------------
  const dash = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.17, 0.72), matTablero);
  dash.position.set(0, 0.885, -1.08);
  dash.rotation.x = -0.07;
  scene.add(dash);

  const dashFrente = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.34, 0.10), matCueroSuave);
  dashFrente.position.set(0, 0.745, -0.80);
  scene.add(dashFrente);

  const dashBajo = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.22, 0.5), matCuero);
  dashBajo.position.set(0, 0.535, -0.72);
  scene.add(dashBajo);

  // Banda de luz ambiental del salpicadero (azul) y filete ámbar inferior.
  const luzDash = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.010, 0.018), matCyan);
  luzDash.position.set(0, 1.006, -1.02);
  scene.add(luzDash);
  const fileteAmbar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.008, 0.014), matAmbar);
  fileteAmbar.position.set(0, 0.62, -0.965);
  scene.add(fileteAmbar);

  // --- Capó del cuadro de instrumentos ------------------------------------
  const visera = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.16), matCuero);
  visera.position.set(0, 1.155, -0.82);
  visera.rotation.x = 0.12;
  scene.add(visera);

  const moldura = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.012, 0.014), matCromo);
  moldura.position.set(0, 0.832, -0.975);
  scene.add(moldura);
  const boton = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.01, 24), matAmbar);
  boton.rotation.x = Math.PI / 2;
  boton.position.set(-0.24, 0.875, -0.905);
  scene.add(boton);

  // --- Cuadro digital ------------------------------------------------------
  const cuadro = crearPantalla(0.50, 0.18, 640, 240);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.225, 0.035), matNegroPiano);
  bezel.position.set(0, 1.11, -0.79);
  bezel.rotation.x = -0.12;
  scene.add(bezel);
  cuadro.mesh.position.set(0, 1.11, -0.77);
  cuadro.mesh.rotation.x = -0.12;
  cuadro.mesh.name = 'cuadro';
  pantallas[pantallas.length - 1].tipo = 'velocidad';
  scene.add(cuadro.mesh);

  // --- Volante deportivo ---------------------------------------------------
  wheelGroup = new THREE.Group();
  wheelGroup.position.set(0, 0.74, -0.34);
  wheelGroup.rotation.x = -0.24;
  scene.add(wheelGroup);

  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.021, 16, 56), matCuero);
  aro.scale.y = 0.94;
  wheelGroup.add(aro);
  const aroLuz = new THREE.Mesh(
    new THREE.TorusGeometry(0.149, 0.0045, 8, 56),
    new THREE.MeshStandardMaterial({ color: 0x0a1a20, emissive: 0x38e1ff, emissiveIntensity: 1.5, roughness: 0.3 })
  );
  aroLuz.scale.y = 0.94;
  wheelGroup.add(aroLuz);

  const radioIzq = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.026, 0.028), matNegroPiano);
  radioIzq.position.set(-0.075, 0.005, 0.005);
  wheelGroup.add(radioIzq);
  const radioDer = radioIzq.clone();
  radioDer.position.x = 0.075;
  wheelGroup.add(radioDer);
  const radioAbajo = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.10, 0.028), matNegroPiano);
  radioAbajo.position.set(0, -0.075, 0.005);
  wheelGroup.add(radioAbajo);

  const buje = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.035, 28), matCromo);
  buje.rotation.x = Math.PI / 2;
  buje.position.z = 0.012;
  wheelGroup.add(buje);
  const logo = crearPantalla(0.085, 0.032, 256, 96);
  logo.ctx.fillStyle = '#05080d';
  logo.ctx.fillRect(0, 0, 256, 96);
  logo.ctx.fillStyle = '#c8f6ff';
  logo.ctx.font = '900 58px system-ui, sans-serif';
  logo.ctx.textAlign = 'center';
  logo.ctx.textBaseline = 'middle';
  logo.ctx.fillText('GT4', 128, 52);
  logo.tex.needsUpdate = true;
  logo.mesh.position.set(0, 0, 0.033);
  wheelGroup.add(logo.mesh);

  // Levas de cambio detrás del volante.
  for (const lado of [-1, 1]) {
    const leva = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.10, 0.012), matCromo);
    leva.position.set(lado * 0.20, 0.015, -0.03);
    leva.rotation.z = lado * 0.18;
    wheelGroup.add(leva);
  }

  const columna = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.32, 20), matNegroPiano);
  columna.rotation.x = Math.PI / 2;
  columna.position.set(0, 0.70, -0.70);
  scene.add(columna);

  // --- Consola central -----------------------------------------------------
  const consolaBase = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.44), matCarbono);
  consolaBase.position.set(0.30, 0.52, -0.68);
  consolaBase.rotation.x = -0.35;
  scene.add(consolaBase);

  const consola = crearPantalla(0.245, 0.145, 512, 288);
  consola.mesh.position.set(0.275, 0.77, -0.60);
  consola.mesh.rotation.x = -0.32;
  consola.mesh.rotation.y = 0.05;
  consola.mesh.name = 'consola';
  pantallas[pantallas.length - 1].tipo = 'ruta';
  scene.add(consola.mesh);

  const marcoConsola = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.172, 0.018), matNegroPiano);
  marcoConsola.position.set(0.275, 0.77, -0.61);
  marcoConsola.rotation.x = -0.32;
  scene.add(marcoConsola);

  // Botonera y mando de marchas.
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.010, 0.012), i === 2 ? matAmbar : matCromo);
    b.position.set(0.17 + i * 0.038, 0.575, -0.70);
    scene.add(b);
  }
  const palanca = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.11, 16), matCromo);
  palanca.position.set(0.30, 0.47, -0.58);
  palanca.rotation.x = -0.3;
  scene.add(palanca);
  const pomo = new THREE.Mesh(new THREE.SphereGeometry(0.033, 20, 14), matNegroPiano);
  pomo.position.set(0.30, 0.525, -0.61);
  scene.add(pomo);

  // --- Salidas de ventilación ---------------------------------------------
  for (const x of [-0.36, 0.36]) {
    const marco = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.09, 0.03), matNegroPiano);
    marco.position.set(x, 0.865, -0.705);
    scene.add(marco);
    for (let i = 0; i < 4; i++) {
      const lama = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.007, 0.014), matCromo);
      lama.position.set(x, 0.905 - i * 0.024, -0.69);
      scene.add(lama);
    }
  }

  // --- Puertas y pilares ---------------------------------------------------
  for (const lado of [-1, 1]) {
    const puerta = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.62), matCueroSuave);
    puerta.position.set(lado * 0.94, 0.55, -0.36);
    puerta.rotation.z = lado * -0.08;
    scene.add(puerta);
    const luzPuerta = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.46), matCyan);
    luzPuerta.position.set(lado * 0.90, 0.76, -0.38);
    scene.add(luzPuerta);
    const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.80, 0.13), matCuero);
    pilar.position.set(lado * 0.82, 1.34, -0.80);
    pilar.rotation.z = lado * 0.34;
    scene.add(pilar);
  }

  const techo = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.06, 0.30), matCuero);
  techo.position.set(0, 1.86, -1.05);
  // El techo se deja fuera del encuadre: en vertical tapaba el parabrisas.
  // scene.add(techo);

  const espejo = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.085, 0.06), matNegroPiano);
  espejo.position.set(0, 1.66, -0.92);
  // scene.add(espejo);
  const cristalEspejo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.245, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x1a2a3a })
  );
  cristalEspejo.position.set(0, 1.66, -0.887);
  // scene.add(cristalEspejo);

  // Insignia GT4 del acompañante.
  const placa = crearPantalla(0.14, 0.045, 256, 80);
  placa.ctx.fillStyle = 'rgba(3,7,12,0)';
  placa.ctx.clearRect(0, 0, 256, 80);
  placa.ctx.fillStyle = '#dff6ff';
  placa.ctx.font = '900 46px system-ui, sans-serif';
  placa.ctx.textAlign = 'center';
  placa.ctx.textBaseline = 'middle';
  placa.ctx.fillText('GT4', 128, 42);
  placa.tex.needsUpdate = true;
  placa.mesh.position.set(-0.44, 0.90, -0.91);
  placa.mesh.rotation.x = -0.35;
  scene.add(placa.mesh);

  // Piso y pedalera: cierran el hueco bajo el volante para que no se vea la
  // cámara a través del coche.
  const piso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 1.25), matCuero);
  piso.position.set(0, 0.34, -0.68);
  scene.add(piso);
  const mampara = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.5, 0.06), matNegroPiano);
  mampara.position.set(0, 0.57, -0.92);
  mampara.rotation.x = -0.12;
  scene.add(mampara);
  for (const x of [-0.14, 0.14]) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.025), matCromo);
    pedal.position.set(x, 0.47, -0.80);
    pedal.rotation.x = -0.35;
    scene.add(pedal);
  }

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
  // La cabina es decorativa: 30 fps bastan y ahorran batería.
  if (now - ultimoPintado < 33) return;
  ultimoPintado = now;
  const t = (now - t0) / 1000;
  if (wheelGroup) {
    // Micro-movimiento de suspensión; no inventa el giro del volante.
    wheelGroup.rotation.z = Math.sin(t * 0.9) * 0.012;
    wheelGroup.position.y = 0.745 + Math.sin(t * 2.1) * 0.0018;
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
