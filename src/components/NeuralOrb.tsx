import { memo, useEffect, useRef } from "react";

export type OrbState = "idle" | "thinking" | "responding";

interface Props {
  state: OrbState;
  model?: string;
}

interface WavePoint {
  phase: number;
  freq: number;
  amp: number;
}

function NeuralOrbImpl({ state, model }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<OrbState>(state);
  const wavePointsRef = useRef<WavePoint[]>([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const wp: WavePoint[] = [];
    for (let i = 0; i < 120; i++) {
      wp.push({
        phase: Math.random() * Math.PI * 2,
        freq: 0.8 + Math.random() * 1.6,
        amp: 0.6 + Math.random() * 0.8,
      });
    }
    wavePointsRef.current = wp;

    const cnv = canvasRef.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    const W = cnv.width;
    const H = cnv.height;
    const cx = W / 2;
    const cy = H / 2;

    // Throttle to 30fps. Real perf killer was backdrop-filter (now removed);
    // canvas with reduced shadowBlur + fewer segments is fine at 30fps.
    let rafId = 0;
    let lastDraw = 0;
    const TARGET_MS = 33; // ~30fps for all states

    const draw = (t: number) => {
      const orbState = stateRef.current;
      if (t - lastDraw < TARGET_MS) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      lastDraw = t;

      ctx.clearRect(0, 0, W, H);
      const time = t / 1000;

      let spinSpeed = 0.15;
      let pulseAmp = 0;
      let waveActivity = 0;
      if (orbState === "idle") {
        spinSpeed = 0.1;
        pulseAmp = 1;
        waveActivity = 0.15;
      }
      if (orbState === "thinking") {
        spinSpeed = 0.9;
        pulseAmp = 0.3;
        waveActivity = 0.5;
      }
      if (orbState === "responding") {
        spinSpeed = 0.4;
        pulseAmp = 0.5;
        waveActivity = 1.0;
      }

      const pulse = 1 + Math.sin(time * 1.4) * 0.04 * pulseAmp;

      // Outer ring — no shadow (cheaper)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * spinSpeed * 0.3);
      ctx.strokeStyle = "rgba(107, 240, 255, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 280 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      // Sparse ticks at cardinals only (4 instead of 12)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const r1 = 286 * pulse;
        const r2 = 294 * pulse;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.strokeStyle = "rgba(107, 240, 255, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      // Middle ring — counter-rotating arcs (no shadow)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-time * spinSpeed * 0.6);
      ctx.strokeStyle = "rgba(107, 240, 255, 0.5)";
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 2; i++) {
        const start = (i / 2) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, 230 * pulse, start, start + Math.PI / 2.5);
        ctx.stroke();
      }
      ctx.restore();

      // Inner ring — dashed (no shadow)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * spinSpeed);
      ctx.strokeStyle = "rgba(74, 216, 196, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, 180 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Wave ring — reduced steps + smaller shadow
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.2);
      ctx.strokeStyle = "rgba(107, 240, 255, 0.9)";
      ctx.lineWidth = 1.6;
      ctx.shadowColor = "#6bf0ff";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      const steps = 60; // was 180
      const wavePoints = wavePointsRef.current;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wpi = wavePoints[i % wavePoints.length];
        const wave = Math.sin(time * wpi.freq + wpi.phase + a * 3) * wpi.amp * 12 * waveActivity;
        const r = 140 + wave;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Core — single gradient (cheap)
      const coreR = 60 + Math.sin(time * 2) * 4 * pulseAmp;
      const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      coreG.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      coreG.addColorStop(0.3, "rgba(107, 240, 255, 0.9)");
      coreG.addColorStop(0.7, "rgba(74, 216, 196, 0.4)");
      coreG.addColorStop(1, "rgba(107, 240, 255, 0)");
      ctx.fillStyle = coreG;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 1.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(cx - 8, cy - 10, 14, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting particles — fewer + smaller shadow
      const orbCount = orbState === "thinking" ? 4 : orbState === "responding" ? 3 : 2;
      ctx.shadowColor = "#6bf0ff";
      ctx.shadowBlur = 4;
      for (let i = 0; i < orbCount; i++) {
        const a = time * spinSpeed * 1.4 + (i / orbCount) * Math.PI * 2;
        const r = 200 + Math.sin(time * 1.5 + i) * 30;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        ctx.fillStyle = "rgba(107, 240, 255, 0.95)";
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const label = state.toUpperCase();

  return (
    <div className="center-stage">
      <div className="orb-wrap">
        <canvas ref={canvasRef} width={640} height={640} className="orb-canvas" />
      </div>
      <div className="stage-hud">
        <div className="hud-corners">
          <div className="tl" />
          <div className="tr" />
          <div className="bl" />
          <div className="br" />
        </div>
        <div className="stage-readout">
          MODEL <span className="value">{modelShortLabel(model)}</span>
        </div>
        <div className="stage-readout-right">
          STREAM <span className="value">{state === "idle" ? "READY" : "OK"}</span>
        </div>
        <div className="state-label">
          <div className="bar" />
          <span>{label}</span>
          <div className="bar" />
        </div>
      </div>
    </div>
  );
}

function modelShortLabel(id?: string): string {
  if (!id) return "—";
  if (id.includes("opus-4-7")) return "OPUS-4.7";
  if (id.includes("opus-4-6")) return "OPUS-4.6";
  if (id.includes("sonnet-4-6")) return "SONNET-4.6";
  if (id.includes("sonnet-4-5")) return "SONNET-4.5";
  if (id.includes("haiku-4-5")) return "HAIKU-4.5";
  return id.toUpperCase();
}

export const NeuralOrb = memo(NeuralOrbImpl);

