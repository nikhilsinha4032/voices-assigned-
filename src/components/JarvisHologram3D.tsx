import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AssistantMood } from '../types/assistant';

interface JarvisHologram3DProps {
  isActivated: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isLocked?: boolean;
  mood: AssistantMood;
  audioLevel?: number;
  className?: string;
  label?: string;
}

const _vec3 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _axis = new THREE.Vector3(0, 1, 0);
const _targetColor = new THREE.Color();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createRadialGlowTexture(r: number, g: number, b: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 124);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
    grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.22)`);
    grad.addColorStop(1, 'rgba(5, 10, 20, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBrushedMetalTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#9aa8b8';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const shade = 135 + ((y * 17) % 34);
      ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 10})`;
      ctx.fillRect(0, y, 256, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

export const JarvisHologram3D: React.FC<JarvisHologram3DProps> = ({
  isActivated,
  isListening,
  isSpeaking,
  isLocked = false,
  mood,
  audioLevel = 0,
  className = '',
  label = 'JARVIS 3D AI Hologram Core',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [contextLost, setContextLost] = useState(false);

  const liveStateRef = useRef({
    isActivated,
    isListening,
    isSpeaking,
    isLocked,
    mood,
    audioLevel,
  });
  liveStateRef.current = {
    isActivated,
    isListening,
    isSpeaking,
    isLocked,
    mood,
    audioLevel,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = detectSoftwareWebGL();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setContextLost(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(240, container.clientWidth || 420);
    const height = Math.max(240, container.clientHeight || 360);
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const handleLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.FogExp2(0x050a14, 0.048);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 40);
    camera.position.set(0, 0.35, 5.15);
    camera.lookAt(0, 0.05, 0);

    // Three-point warm/cool studio + holographic core lighting
    const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x0b1220, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1db, 1.35);
    keyLight.position.set(3.5, 5.2, 4.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(512, 512);
    keyLight.shadow.camera.left = -2.5;
    keyLight.shadow.camera.right = 2.5;
    keyLight.shadow.camera.top = 2.5;
    keyLight.shadow.camera.bottom = -2.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
    rimLight.position.set(-4.0, 2.0, -3.5);
    scene.add(rimLight);

    const coreLight = new THREE.PointLight(0x38bdf8, 2.2, 9, 1.8);
    coreLight.position.set(0, 0.3, 0.4);
    scene.add(coreLight);

    // Disposables registry
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [envTex];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      materials.push(m);
      return m;
    };

    const metalRoughTex = createBrushedMetalTexture();
    metalRoughTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textures.push(metalRoughTex);

    const shadowTex = createRadialGlowTexture(14, 165, 233);
    textures.push(shadowTex);

    // Root hero group
    const heroGroup = new THREE.Group();
    scene.add(heroGroup);

    // 1. Soft radial ground contact shadow
    const shadowGeo = trackGeo(new THREE.PlaneGeometry(3.6, 3.6));
    const shadowMat = trackMat(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      })
    );
    const contactPlane = new THREE.Mesh(shadowGeo, shadowMat);
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = -1.64;
    heroGroup.add(contactPlane);

    // 2. Stepped Brushed-Titanium Emitter Pedestal (LatheGeometry, grounded at y=-1.65)
    const lathePoints = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(1.12, 0.0),
      new THREE.Vector2(1.06, 0.09),
      new THREE.Vector2(0.86, 0.14),
      new THREE.Vector2(0.76, 0.24),
      new THREE.Vector2(0.56, 0.28),
      new THREE.Vector2(0.48, 0.34),
      new THREE.Vector2(0.0, 0.34),
    ];
    const pedestalGeo = trackGeo(new THREE.LatheGeometry(lathePoints, 48));
    const pedestalMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.9,
        roughness: 0.26,
        roughnessMap: metalRoughTex,
      })
    );
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -1.65;
    pedestal.receiveShadow = true;
    heroGroup.add(pedestal);

    // Glowing aperture collar on top of pedestal
    const apertureGeo = trackGeo(new THREE.TorusGeometry(0.54, 0.025, 16, 48));
    const apertureMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 1.4,
        roughness: 0.2,
        metalness: 0.5,
      })
    );
    const apertureRing = new THREE.Mesh(apertureGeo, apertureMat);
    apertureRing.rotation.x = Math.PI / 2;
    apertureRing.position.y = -1.31;
    heroGroup.add(apertureRing);

    // Upward soft projection cone
    const coneGeo = trackGeo(new THREE.CylinderGeometry(1.18, 0.45, 1.5, 36, 1, true));
    const coneMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const projectionCone = new THREE.Mesh(coneGeo, coneMat);
    projectionCone.position.y = -0.58;
    heroGroup.add(projectionCone);

    // 3. Floating Holographic AI Robot Core Group
    const coreGroup = new THREE.Group();
    coreGroup.position.y = 0.28;
    heroGroup.add(coreGroup);

    // 3a. Inner Neural Crystal Core
    const innerCoreGeo = trackGeo(new THREE.IcosahedronGeometry(0.46, 2));
    const innerCoreMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.5,
        roughness: 0.15,
        metalness: 0.25,
        transparent: true,
        opacity: 0.92,
      })
    );
    const innerCore = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    coreGroup.add(innerCore);

    // 3b. Sculpted Holographic AI Robot Head Shell & Visor Silhouette
    const robotHeadGroup = new THREE.Group();
    coreGroup.add(robotHeadGroup);

    const craniumGeo = trackGeo(new THREE.SphereGeometry(0.72, 32, 24));
    const craniumMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x0c4a6e,
        emissive: 0x0369a1,
        emissiveIntensity: 0.35,
        roughness: 0.18,
        metalness: 0.1,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        clearcoat: 1.0,
      })
    );
    const cranium = new THREE.Mesh(craniumGeo, craniumMat);
    cranium.scale.set(0.92, 1.04, 0.96);
    robotHeadGroup.add(cranium);

    // Outer geodesic holographic wireframe shell
    const cageGeo = trackGeo(new THREE.IcosahedronGeometry(0.79, 1));
    const cageMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
      })
    );
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    robotHeadGroup.add(cageMesh);

    // Friendly AI Visor Band
    const visorGeo = trackGeo(
      new THREE.CylinderGeometry(0.73, 0.71, 0.24, 32, 1, true, -Math.PI * 0.36, Math.PI * 0.72)
    );
    const visorMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x082f49,
        emissive: 0x0284c7,
        emissiveIntensity: 0.55,
        roughness: 0.15,
        metalness: 0.85,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      })
    );
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.08, 0.04);
    robotHeadGroup.add(visor);

    // Expressive glowing AI Eyes inside the visor
    const eyeGeo = trackGeo(new THREE.CapsuleGeometry(0.055, 0.08, 6, 12));
    const eyeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        emissive: 0x38bdf8,
        emissiveIntensity: 2.2,
        roughness: 0.1,
        metalness: 0.1,
      })
    );
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.22, 0.1, 0.67);
    leftEye.rotation.z = Math.PI / 2;
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.22, 0.1, 0.67);
    rightEye.rotation.z = Math.PI / 2;
    robotHeadGroup.add(leftEye, rightEye);

    // Acoustic Ear / Sensor Pods (left & right)
    const earGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 24));
    const earMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.88,
        roughness: 0.28,
      })
    );
    const leftEar = new THREE.Mesh(earGeo, earMat);
    leftEar.rotation.z = Math.PI / 2;
    leftEar.position.set(-0.73, 0.04, 0);
    const rightEar = new THREE.Mesh(earGeo, earMat);
    rightEar.rotation.z = Math.PI / 2;
    rightEar.position.set(0.73, 0.04, 0);
    robotHeadGroup.add(leftEar, rightEar);

    // 4. Three Articulated Gyroscopic Gimbal Rings
    const ringMatA = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.9,
        metalness: 0.85,
        roughness: 0.22,
      })
    );
    const ringMatB = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.65,
        metalness: 0.78,
        roughness: 0.3,
        transparent: true,
        opacity: 0.85,
      })
    );

    const ring1 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.06, 0.016, 12, 72)), ringMatA);
    ring1.rotation.x = 0.55;
    ring1.rotation.y = 0.35;
    coreGroup.add(ring1);

    const ring2 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.22, 0.012, 10, 72)), ringMatB);
    ring2.rotation.x = -0.7;
    ring2.rotation.z = 0.45;
    coreGroup.add(ring2);

    const ring3 = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.38, 0.009, 8, 84)), ringMatB);
    ring3.rotation.y = 0.9;
    ring3.rotation.x = 0.2;
    coreGroup.add(ring3);

    // 5. Orbiting Energy Particles via InstancedMesh (140 nodes)
    const PARTICLE_COUNT = 140;
    const nodeGeo = trackGeo(new THREE.SphereGeometry(0.022, 6, 6));
    const nodeMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.85,
      })
    );
    const particles = new THREE.InstancedMesh(nodeGeo, nodeMat, PARTICLE_COUNT);
    particles.frustumCulled = false;

    const particleMeta = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / PARTICLE_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = 1.0 + (i % 5) * 0.13;
      const speed = 0.25 + (i % 7) * 0.06;
      const scale = 0.65 + (i % 4) * 0.25;
      return { phi, theta, radius, speed, scale };
    });

    particleMeta.forEach((p, i) => {
      _vec3.set(
        Math.sin(p.phi) * Math.cos(p.theta) * p.radius,
        Math.cos(p.phi) * p.radius * 0.88,
        Math.sin(p.phi) * Math.sin(p.theta) * p.radius
      );
      _scale.setScalar(p.scale);
      _mat4.compose(_vec3, _quat, _scale);
      particles.setMatrixAt(i, _mat4);
    });
    particles.instanceMatrix.needsUpdate = true;
    particles.computeBoundingSphere();
    coreGroup.add(particles);

    // Pointer hover target for subtle living eye/head tracking
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // ResizeObserver for crisp layout adaptation
    const handleResize = () => {
      const w = Math.max(200, container.clientWidth);
      const h = Math.max(200, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Smooth animation state
    let smoothedEnergy = 0.2;
    let smoothedScale = 1.0;
    let elapsed = 0;
    let lastTime = performance.now();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const updateScene = (dt: number) => {
      elapsed += dt;
      const { isActivated: act, isListening: list, isSpeaking: spk, isLocked: lck, mood: m, audioLevel: lvl } =
        liveStateRef.current;

      const targetEnergy = lck
        ? 0.25
        : list
        ? 1.0 + lvl * 0.5
        : spk
        ? 0.9 + lvl * 0.65
        : act
        ? 0.65
        : 0.18;

      const targetScale = lck
        ? 0.9
        : list
        ? 1.06 + lvl * 0.08
        : spk
        ? 1.04 + Math.sin(elapsed * 11) * 0.035 + lvl * 0.06
        : act
        ? 1.0
        : 0.92;

      const damp = 1 - Math.exp(-6.5 * dt);
      smoothedEnergy += (targetEnergy - smoothedEnergy) * damp;
      smoothedScale += (targetScale - smoothedScale) * damp;

      // Color palette according to lock / listening / speaking / active / standby
      if (lck) {
        _targetColor.setHex(0xf59e0b); // Amber Sentinel
      } else if (list) {
        _targetColor.setHex(0x2dd4bf); // Listening Teal-Cyan
      } else if (spk) {
        _targetColor.setHex(0x38bdf8); // Speaking Bright Cyan
      } else if (!act) {
        _targetColor.setHex(0x1e40af); // Quiet Standby Deep Blue
      } else if (m === 'empathetic' || m === 'warm') {
        _targetColor.setHex(0x38bdf8);
      } else {
        _targetColor.setHex(0x0ea5e9);
      }

      innerCoreMat.emissive.lerp(_targetColor, damp);
      apertureMat.emissive.lerp(_targetColor, damp);
      ringMatA.emissive.lerp(_targetColor, damp);
      eyeMat.emissive.lerp(_targetColor, damp);
      coreLight.color.lerp(_targetColor, damp);
      coreLight.intensity = 1.1 + smoothedEnergy * 1.9;

      // Breathing float + head gentle tracking
      coreGroup.position.y = 0.26 + Math.sin(elapsed * 1.5) * 0.06;
      coreGroup.scale.setScalar(smoothedScale);

      const targetYaw = pointer.x * 0.28 + Math.sin(elapsed * 0.55) * 0.14;
      const targetPitch = -pointer.y * 0.16 + Math.cos(elapsed * 0.45) * 0.06;
      robotHeadGroup.rotation.y += (targetYaw - robotHeadGroup.rotation.y) * damp;
      robotHeadGroup.rotation.x += (targetPitch - robotHeadGroup.rotation.x) * damp;

      // Expressive blink every ~4.5s (capsules are rotated 90deg on Z, so local X is vertical)
      const blinkCycle = elapsed % 4.6;
      const eyeScaleY = blinkCycle > 4.44 ? 0.15 : spk ? 1.18 : list ? 1.15 : 1.0;
      leftEye.scale.set(eyeScaleY, 1, 1);
      rightEye.scale.set(eyeScaleY, 1, 1);

      innerCore.rotation.y += dt * (0.45 + smoothedEnergy * 0.9);
      innerCore.rotation.x += dt * 0.22;
      cageMesh.rotation.y -= dt * (0.25 + smoothedEnergy * 0.4);

      ring1.rotation.z += dt * (0.55 + smoothedEnergy * 1.1);
      ring1.rotation.y += dt * 0.2;
      ring2.rotation.x -= dt * (0.45 + smoothedEnergy * 0.9);
      ring3.rotation.z -= dt * (0.3 + smoothedEnergy * 0.7);

      // Update InstancedMesh particle halo without allocating objects
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particleMeta[i];
        const angle = p.theta + elapsed * p.speed * (0.45 + smoothedEnergy * 0.75);
        const wobble = 1 + Math.sin(elapsed * 2 + i) * 0.04 * smoothedEnergy;
        const r = p.radius * wobble;
        _vec3.set(
          Math.sin(p.phi) * Math.cos(angle) * r,
          Math.cos(p.phi) * r * 0.88,
          Math.sin(p.phi) * Math.sin(angle) * r
        );
        _scale.setScalar(p.scale * (0.75 + smoothedEnergy * 0.35));
        _quat.setFromAxisAngle(_axis, angle);
        _mat4.compose(_vec3, _quat, _scale);
        particles.setMatrixAt(i, _mat4);
      }
      particles.instanceMatrix.needsUpdate = true;
      coneMat.opacity = act ? 0.06 + smoothedEnergy * 0.05 : 0.025;
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.08, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      updateScene(dt);
      renderer.render(scene, camera);

      if (reducedMotion) return;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', handleLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleRestored);

      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const stateTag = isLocked
    ? 'locked'
    : isListening
    ? 'listening'
    : isSpeaking
    ? 'speaking'
    : isActivated
    ? 'active'
    : 'standby';

  if (contextLost) {
    return (
      <div
        role="img"
        aria-label={label}
        data-testid="jarvis-hologram-3d"
        data-state={stateTag}
        className={`flex items-center justify-center rounded-full border border-sky-500/30 bg-[#071124] text-center text-xs text-sky-300 ${className}`}
      >
        <div className="h-32 w-32 rounded-full border-2 border-dashed border-sky-400/50 p-6">
          <div className="h-full w-full rounded-full bg-sky-500/20" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      role="img"
      aria-label={label}
      data-testid="jarvis-hologram-3d"
      data-state={stateTag}
      className={`relative overflow-hidden ${className}`}
    />
  );
};
