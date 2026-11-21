import React, { useEffect, useRef } from 'react';
import type { AssistantMood } from '../types/assistant';

interface JarvisHologramCanvasProps {
  isListening: boolean;
  isSpeaking: boolean;
  isLocked?: boolean;
  mood: AssistantMood;
  audioLevel?: number; // 0..1
  size?: number;
  label?: string;
}

interface Particle {
  theta: number;
  phi: number;
  radiusOffset: number;
  speed: number;
  size: number;
  alpha: number;
}

function getMoodColor(mood: AssistantMood, isLocked: boolean): [number, number, number] {
  if (isLocked) return [245, 158, 11]; // Amber sentinel
  switch (mood) {
    case 'empathetic':
      return [45, 212, 191]; // Teal-cyan
    case 'encouraging':
    case 'playful':
      return [96, 165, 250]; // Bright sky-blue
    case 'focused':
      return [56, 189, 248]; // Crisp cyan
    case 'serene':
      return [125, 211, 252]; // Soft ice-cyan
    case 'warm':
    default:
      return [56, 189, 248]; // JARVIS holographic cyan
  }
}

export const JarvisHologramCanvas: React.FC<JarvisHologramCanvasProps> = ({
  isListening,
  isSpeaking,
  isLocked = false,
  mood,
  audioLevel = 0,
  size = 240,
  label,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ isListening, isSpeaking, isLocked, mood, audioLevel });
  stateRef.current = { isListening, isSpeaking, isLocked, mood, audioLevel };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const particles: Particle[] = Array.from({ length: 220 }, (_, i) => {
      const t = (i + 0.5) / 220;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        theta,
        phi,
        radiusOffset: ((i % 7) - 3) * 0.025,
        speed: 0.35 + (i % 5) * 0.12,
        size: 1.0 + (i % 3) * 0.55,
        alpha: 0.45 + (i % 4) * 0.14,
      };
    });

    let rafId = 0;
    let time = 0;

    const draw = () => {
      const s = stateRef.current;
      const [r, g, b] = getMoodColor(s.mood, s.isLocked);
      const cx = size / 2;
      const cy = size / 2;
      const baseR = size * 0.27;
      const activeBoost = s.isListening ? 0.14 : s.isSpeaking ? 0.11 : 0;
      const pulse =
        reducedMotion
          ? 0
          : Math.sin(time * (s.isSpeaking ? 7.5 : s.isListening ? 5 : 1.8)) *
            (s.isSpeaking ? 0.07 : s.isListening ? 0.05 : 0.02);
      const energy = Math.min(0.25, s.audioLevel * 0.28);
      const sphereR = baseR * (1 + activeBoost + pulse + energy);

      ctx.clearRect(0, 0, size, size);

      // Subtle radial core aura
      const glow = ctx.createRadialGradient(cx, cy, sphereR * 0.1, cx, cy, size * 0.46);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${s.isListening || s.isSpeaking ? 0.26 : 0.15})`);
      glow.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, 0.05)`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
      ctx.fill();

      // Precision outer HUD reticle rings
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(reducedMotion ? 0 : time * 0.18);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.28)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(reducedMotion ? 0 : -time * 0.28);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([28, 14, 6, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3D projected holographic particle sphere
      const rotY = reducedMotion ? 0.4 : time * (s.isListening || s.isSpeaking ? 0.85 : 0.35);
      const rotX = 0.25;

      const projected: Array<{ x: number; y: number; z: number; size: number; alpha: number }> = [];
      for (const p of particles) {
        const wave =
          s.isSpeaking || s.isListening
            ? Math.sin(p.phi * 5 + time * 6) * 0.06
            : Math.sin(p.theta * 2 + time * 1.4) * 0.015;
        const rad = sphereR * (1 + p.radiusOffset + wave);
        const sinPhi = Math.sin(p.phi);
        const x0 = rad * sinPhi * Math.cos(p.theta + rotY);
        const z0 = rad * sinPhi * Math.sin(p.theta + rotY);
        const y0 = rad * Math.cos(p.phi);

        const y1 = y0 * Math.cos(rotX) - z0 * Math.sin(rotX);
        const z1 = y0 * Math.sin(rotX) + z0 * Math.cos(rotX);
        const depth = (z1 + sphereR * 1.3) / (sphereR * 2.6);

        projected.push({
          x: cx + x0,
          y: cy + y1,
          z: z1,
          size: p.size * (0.65 + depth * 0.8),
          alpha: Math.min(1, p.alpha * (0.35 + depth * 0.8)),
        });
      }

      projected.sort((a, b2) => a.z - b2.z);
      for (const pt of projected) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pt.alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Inner frequency equalizer arc when listening or speaking
      if (s.isListening || s.isSpeaking) {
        const bars = 24;
        ctx.strokeStyle = `rgba(224, 242, 254, 0.85)`;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < bars; i++) {
          const ang = (i / bars) * Math.PI * 2 + time * 0.5;
          const amp = 4 + Math.abs(Math.sin(time * 9 + i * 0.7)) * (s.isSpeaking ? 10 : 12);
          const r1 = size * 0.31;
          const r2 = r1 + amp;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
          ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
          ctx.stroke();
        }
      }

      if (!reducedMotion) {
        time += 0.025;
        rafId = window.requestAnimationFrame(draw);
      }
    };

    draw();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [size]);

  const stateAttr = isLocked ? 'locked' : isListening ? 'listening' : isSpeaking ? 'speaking' : 'idle';

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <canvas
        ref={canvasRef}
        data-testid="jarvis-hologram-canvas"
        data-state={stateAttr}
        style={{ width: size, height: size }}
        aria-label={label ?? 'JARVIS holographic voice core'}
        className="block select-none"
      />
    </div>
  );
};
