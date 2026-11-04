import * as THREE from '/vendor/three/three.module.min.js';
import { RoomEnvironment } from '/vendor/three/RoomEnvironment.js';
import { GLTFLoader } from '/vendor/three/loaders/GLTFLoader.js';
import { DRACOLoader } from '/vendor/three/loaders/DRACOLoader.js';

const canvas = document.getElementById('golf3dCanvas');
const frame = canvas?.closest('.golf3d-frame');
const loading = document.getElementById('golf3dLoading');
const fallback = document.getElementById('golf3dFallback');
const resetBtn = document.getElementById('golf3dReset');
const hotspotsBox = document.getElementById('componentHotspots');

function showFallback(message) {
  loading?.classList.add('hidden');
  if (fallback) {
    fallback.hidden = false;
    const p = fallback.querySelector('p');
    if (p && message) p.textContent = message;
  }
  if (hotspotsBox) hotspotsBox.style.opacity = '0';
}

if (canvas && frame) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    showFallback('No se pudo iniciar WebGL. El diagnóstico y el resto de la plataforma siguen operativos.');
  }

  if (renderer) {
    const isCompact = window.matchMedia('(max-width: 920px)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCompact ? 1.6 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.touchAction = 'pan-y';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 60);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.95;
    envScene.dispose?.();

    const hemi = new THREE.HemisphereLight(0xcfd8ff, 0x05040f, 1.05);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 3.15);
    key.position.set(-5.5, 7.5, 6.5);
    key.castShadow = true;
    key.shadow.mapSize.set(isCompact ? 1024 : 1536, isCompact ? 1024 : 1536);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.035;
    scene.add(key);

    const rimCyan = new THREE.SpotLight(0x22d3ee, 38, 22, Math.PI / 5, 0.5, 1.4);
    rimCyan.position.set(6, 3.2, -5);
    rimCyan.target.position.set(0, 0.8, 0);
    scene.add(rimCyan, rimCyan.target);

    const rimViolet = new THREE.PointLight(0x8b5cf6, 26, 18, 2);
    rimViolet.position.set(-6, 2.2, -4.5);
    scene.add(rimViolet);

    const softFront = new THREE.PointLight(0xbfdbfe, 16, 16, 2);
    softFront.position.set(2.5, 2.4, 6);
    scene.add(softFront);

    const underLight = new THREE.PointLight(0x22d3ee, 5, 7, 2);
    underLight.position.set(0, 0.28, 0);
    scene.add(underLight);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.5 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.002;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 72),
      new THREE.MeshBasicMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.004;
    scene.add(glow);

    const car = new THREE.Group();
    scene.add(car);
    if (hotspotsBox) {
      hotspotsBox.style.opacity = '0';
      hotspotsBox.style.transition = 'opacity .35s ease';
    }

    const anchors = {
      motor: [-1.32, 0.98, 0.02],
      turbo: [-1.56, 0.79, 0.43],
      admision: [-1.68, 0.86, -0.36],
      egr: [-1.39, 0.72, 0.43],
      dpf: [1.73, 0.46, 0.02],
      combustible: [0.6, 0.42, 0.02],
      distribucion: [-1.56, 0.88, 0.24],
      transmision: [0.05, 0.37, 0.02],
      frenos: [-1.2, 0.33, 0.84],
      suspension: [1.2, 0.33, -0.84],
      sensores: [-0.6, 1.04, 0.02],
      centralita: [-0.24, 0.98, 0.3]
    };

    const state = {
      theta: -0.62,
      phi: 1.16,
      radius: 5.15,
      targetTheta: -0.62,
      targetPhi: 1.16,
      targetRadius: 5.15,
      fit: 1,
      dragging: false,
      lastX: 0,
      lastY: 0,
      pointerId: null,
      loaded: false
    };
    const lookAt = new THREE.Vector3(0, 0.58, 0);

    function applyCamera() {
      const r = state.radius * state.fit;
      const sp = Math.sin(state.phi) * r;
      camera.position.set(
        sp * Math.sin(state.theta),
        Math.cos(state.phi) * r + 0.45,
        sp * Math.cos(state.theta)
      );
      camera.lookAt(lookAt);
    }

    function setSize() {
      const w = Math.max(1, frame.clientWidth);
      const h = Math.max(1, frame.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      state.fit = Math.max(1, Math.pow(1.78 / camera.aspect, 0.68));
      applyCamera();
    }
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(frame);

    canvas.addEventListener('pointerdown', e => {
      state.dragging = true;
      state.pointerId = e.pointerId;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!state.dragging || e.pointerId !== state.pointerId) return;
      const dx = e.clientX - state.lastX;
      const dy = e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.targetTheta -= dx * 0.006;
      state.targetPhi = THREE.MathUtils.clamp(state.targetPhi - dy * 0.004, 1.02, 1.4);
    });
    const endDrag = e => {
      state.dragging = false;
      if (e?.pointerId !== undefined) canvas.releasePointerCapture?.(e.pointerId);
      state.pointerId = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', e => { if (state.dragging) endDrag(e); });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      state.targetRadius = THREE.MathUtils.clamp(state.targetRadius + e.deltaY * 0.003, 5.0, 7.2);
    }, { passive: false });
    canvas.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') state.targetTheta += 0.12;
      if (e.key === 'ArrowRight') state.targetTheta -= 0.12;
      if (e.key === 'ArrowUp') state.targetPhi = Math.max(1.02, state.targetPhi - 0.08);
      if (e.key === 'ArrowDown') state.targetPhi = Math.min(1.4, state.targetPhi + 0.08);
    });
    canvas.tabIndex = 0;
    const reset = () => {
      state.theta = -0.62;
      state.phi = 1.16;
      state.radius = 5.15;
      state.targetTheta = -0.62;
      state.targetPhi = 1.16;
      state.targetRadius = 5.15;
      applyCamera();
    };
    resetBtn?.addEventListener('click', reset);
    canvas.addEventListener('dblclick', reset);

    const hotspotEls = new Map();
    function syncHotspots() {
      if (!state.loaded || !hotspotsBox) return;
      if (!hotspotEls.size) {
        hotspotsBox.querySelectorAll('.component-hotspot[data-component]').forEach(el => {
          if (anchors[el.dataset.component]) hotspotEls.set(el.dataset.component, el);
        });
      }
      const v = new THREE.Vector3();
      for (const [id, el] of hotspotEls) {
        const a = anchors[id];
        v.set(a[0], a[1], a[2]);
        car.localToWorld(v);
        v.project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.32 || Math.abs(v.y) > 1.32) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }
        el.style.opacity = '';
        el.style.pointerEvents = '';
        el.style.setProperty('--x', `${((v.x * 0.5 + 0.5) * 100).toFixed(2)}%`);
        el.style.setProperty('--y', `${((-v.y * 0.5 + 0.5) * 100).toFixed(2)}%`);
      }
    }

    function tuneMaterials(root) {
      const seen = new Map();
      root.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        const src = o.material;
        if (seen.has(src)) {
          o.material = seen.get(src);
          return;
        }
        let m;
        if (src.name === 'paint') {
          m = new THREE.MeshPhysicalMaterial({
            map: src.map,
            normalMap: src.normalMap,
            aoMap: src.aoMap,
            color: 0x3f6de0,
            metalness: 0.55,
            roughness: 0.34,
            clearcoat: 0.65,
            clearcoatRoughness: 0.2,
            envMapIntensity: 1.15
          });
        } else if (src.name === 'glass') {
          m = new THREE.MeshPhysicalMaterial({
            map: src.map,
            color: 0x111b2e,
            metalness: 0.4,
            roughness: 0.05,
            transparent: true,
            opacity: 0.86,
            clearcoat: 1,
            envMapIntensity: 1.7,
            depthWrite: false
          });
        } else if (src.name === 'wheels') {
          m = new THREE.MeshStandardMaterial({
            map: src.map,
            normalMap: src.normalMap,
            aoMap: src.aoMap,
            color: 0xd8dee8,
            metalness: 0.82,
            roughness: 0.3,
            envMapIntensity: 1.35
          });
        } else if (src.name === 'interior') {
          m = new THREE.MeshStandardMaterial({
            color: 0x0b0c10,
            metalness: 0.12,
            roughness: 0.86,
            envMapIntensity: 0.5,
            side: THREE.DoubleSide
          });
        } else if (src.name === 'trim' || src.name === 'underbody') {
          m = new THREE.MeshStandardMaterial({
            map: src.map || null,
            color: src.name === 'underbody' ? 0x1a1c22 : src.color,
            metalness: 0.3,
            roughness: 0.64,
            envMapIntensity: 0.7
          });
        } else if (src.name === 'front-lights-badge' || src.name === 'rear-lights-badge') {
          m = new THREE.MeshPhysicalMaterial({
            map: src.map,
            color: 0xffffff,
            metalness: 0.45,
            roughness: 0.22,
            clearcoat: 1,
            envMapIntensity: 1.4
          });
        } else if (src.name === 'rear-indicator') {
          m = new THREE.MeshStandardMaterial({
            color: 0xff4d12,
            emissive: 0x8a1d00,
            emissiveIntensity: 0.55,
            metalness: 0.35,
            roughness: 0.3
          });
        } else {
          m = src.clone();
          m.envMapIntensity = 1.05;
        }
        m.name = src.name;
        seen.set(src, m);
        o.material = m;
      });
    }

    const draco = new DRACOLoader();
    draco.setDecoderPath('/vendor/three/libs/draco/gltf/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load('/models/golf-r-75.glb', gltf => {
      const model = gltf.scene;
      const rawBox = new THREE.Box3().setFromObject(model);
      const center = rawBox.getCenter(new THREE.Vector3());
      const scale = 0.024;
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -rawBox.min.y * scale, -center.z * scale);
      model.rotation.y = 0;
      tuneMaterials(model);
      car.add(model);

      state.loaded = true;
      loading?.classList.add('hidden');
      if (hotspotsBox) hotspotsBox.style.opacity = '1';
      syncHotspots();
    }, xhr => {
      if (!loading || loading.classList.contains('hidden')) return;
      if (xhr.total > 0) {
        const pct = Math.min(99, Math.round((xhr.loaded / xhr.total) * 100));
        const label = loading.lastChild;
        if (label?.nodeType === Node.TEXT_NODE) label.textContent = ` Cargando modelo 3D… ${pct}%`;
      }
    }, err => {
      console.error('No se pudo cargar el modelo 3D del Golf:', err);
      showFallback('No se pudo cargar el modelo 3D. El diagnóstico y el resto de la plataforma siguen operativos.');
    });

    let raf = 0;
    let last = performance.now();
    function animate(now) {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Giro lento de escaparate cuando nadie toca el coche.
      if (state.loaded && !state.dragging) state.targetTheta += dt * 0.11;
      state.theta += (state.targetTheta - state.theta) * Math.min(1, dt * 8);
      state.phi += (state.targetPhi - state.phi) * Math.min(1, dt * 8);
      state.radius += (state.targetRadius - state.radius) * Math.min(1, dt * 7);
      applyCamera();
      glow.material.opacity = 0.12 + Math.sin(now * 0.0011) * 0.022;
      rimCyan.intensity = 36 + Math.sin(now * 0.0015) * 5;
      underLight.intensity = 4.5 + Math.sin(now * 0.0018 + 1) * 0.8;
      syncHotspots();
      renderer.render(scene, camera);
    }

    const start = () => {
      last = performance.now();
      raf = requestAnimationFrame(animate);
    };
    if (document.visibilityState === 'visible') requestAnimationFrame(start);
    else document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !raf) start(); }, { once: true });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(animate);
      }
    });

    window.addEventListener('beforeunload', () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      envRT.dispose();
      pmrem.dispose();
      draco.dispose();
      renderer.dispose();
    });

    window.__golf3d = {
      scene,
      camera,
      car,
      renderer,
      state,
      reset
    };
  }
}
