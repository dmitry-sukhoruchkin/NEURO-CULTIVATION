import React, { useEffect, useRef } from 'react';
import { NeuroAudioEngine } from '../lib/NeuroAudioEngine';
import { CultivationEngine } from '../lib/CultivationEngine';
import { InputService } from '../lib/InputService';
import { BleService } from '../lib/BleService';
import { Radio } from 'lucide-react';

interface RhythmicLawPanelProps {
  audioEngine: NeuroAudioEngine | null;
  cultivationState: {
    levelName: string;
    progress: number;
    instability: number;
    autoProgression: boolean;
  };
  setCultivationState: React.Dispatch<React.SetStateAction<any>>;
  visualsEnabled: boolean;
  controlMode: 'Motor' | 'Sweep' | 'Resonance' | 'Classic' | 'Semantic';
}

export function RhythmicLawPanel({ audioEngine, cultivationState, setCultivationState, visualsEnabled, controlMode }: RhythmicLawPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Update loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      // 1. Get raw/smoothed axes from the current active source (-1 to +1)
      const inputService = InputService.getInstance();
      const bleService = BleService.getInstance();
      const cultEngine = CultivationEngine.getInstance();
      
      // The CultivationEngine updates its logic externally, but we have access to it directly.
      const level = cultEngine.level;
      const instability = cultEngine.instability;
      const exactLevel = cultEngine.level - 1 + cultEngine.progress;
      const chaosFactor = Math.min(1.0, Math.max(0.0, exactLevel / 3.0));
      const assist = Math.max(0, 1.0 - chaosFactor);

      if (!visualsEnabled) {
          animId = requestAnimationFrame(render);
          return;
      }

      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;

      // Draw the semantic rhythmic landscape (Avatars instead of bars)
      const cx = w / 2;
      const cy = h / 2;

      // Grid background
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 20; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * h / 20); ctx.lineTo(w, i * h / 20);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * w / 20, 0); ctx.lineTo(i * w / 20, h);
        ctx.stroke();
      }

      ctx.strokeStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
      ctx.moveTo(0, cy); ctx.lineTo(w, cy);
      ctx.stroke();

      if (audioEngine) {
        const avatars = audioEngine.musicAvatars;
        const colors = ['#f43f5e', '#ec4899', '#8b5cf6'];
        const labels = ['Drums (M1)', 'Synth (M2)', 'Pad (M3)'];

        for (let i = 0; i < avatars.length; i++) {
           const a = avatars[i];
           if (!a) break;

           // Coordinate map: -10..10 normalized to canvas
           const ax = cx + (a.x / 10.0) * (w / 2);
           const ay = cy - (a.y / 10.0) * (h / 2); // -y is up

           ctx.save();
           ctx.translate(ax, ay);
           ctx.rotate(a.r); // Render actual rotation

           ctx.fillStyle = colors[i % colors.length];
           ctx.beginPath();
           ctx.moveTo(0, -10);
           ctx.lineTo(8, 10);
           ctx.lineTo(0, 6);
           ctx.lineTo(-8, 10);
           ctx.fill();

           ctx.fillStyle = '#fff';
           ctx.font = '10px monospace';
           ctx.fillText(labels[i] || '', 15, 0);

           ctx.restore();
        }
      }

      // Draw status overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(10, 10, 240, 105);
          ctx.strokeStyle = '#06b6d4';
          ctx.strokeRect(10, 10, 240, 105);
          
          ctx.fillStyle = '#22d3ee';
          ctx.textAlign = 'left';
          ctx.font = '12px monospace';
          ctx.fillText(`LAW OF RHYTHM`, 20, 28);
          ctx.fillStyle = '#fff';
          ctx.fillText(`Cultivation: L${level}`, 20, 45);
          
          const assistColor = assist > 0.5 ? '#10b981' : '#ef4444';
          ctx.fillStyle = assistColor;
          ctx.fillText(`System Assist: ${(assist * 100).toFixed(0)}%`, 20, 62);
          
          if (audioEngine) {
            ctx.fillStyle = audioEngine.isRhythmLocked ? '#ec4899' : '#10b981';
            ctx.fillText(`BPM: ${audioEngine.currentBPM.toFixed(1)} [${audioEngine.isRhythmLocked ? 'LOCKED' : 'ADAPTIVE'}]`, 20, 79);
            ctx.fillStyle = audioEngine.isAutoDrums ? '#10b981' : '#6b7280';
            ctx.fillText(`Auto-Drums Override: ${audioEngine.isAutoDrums ? 'ON' : 'OFF'}`, 20, 96);
          }
          
          // If heart demon active
          if (level === 4 && instability > 0.8) {
            ctx.fillStyle = '#ef4444';
            ctx.fillText(`HEART DEMON TRIGGERED`, 250, 45);
          }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [audioEngine, cultivationState, visualsEnabled, controlMode]);

  return (
    <div className="absolute inset-0 z-0 flex flex-col bg-[#050505] text-cyan-400 font-mono overflow-y-auto p-4 md:p-6 select-none pt-20">
      <div className="flex-1 w-full border border-cyan-950 bg-black/40 rounded-lg relative overflow-hidden flex flex-col items-center justify-center p-4">
        
        <div className="absolute top-4 right-4 text-right z-10 flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 text-white">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-cyan-500 font-bold">Axiomatic Projection</span>
          </div>
        </div>

        <canvas 
          ref={canvasRef} 
          className="w-full h-full max-h-[500px] border border-cyan-900/30 rounded"
          width={800}
          height={400}
        />

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2 w-full text-[9px] text-gray-400 uppercase text-center">
            <div className="border border-cyan-950 bg-black/60 p-2 rounded">
                <span className="text-white">A0:</span> Kick Impulse / Beat (Zero Crossing)
            </div>
            <div className="border border-cyan-950 bg-black/60 p-2 rounded">
                <span className="text-white">A1:</span> Bass Flow 
            </div>
            <div className="border border-cyan-950 bg-black/60 p-2 rounded">
                <span className="text-white">A4:</span> High Percussion (Hats)
            </div>
            <div className="border border-cyan-950 bg-black/60 p-2 rounded">
                <span className="text-white">A2/A3:</span> Lead FM Pitch / Drive
            </div>
            
            <div className="border border-cyan-950 bg-black/60 p-2 rounded">
                <span className="text-white">A7:</span> Drone Vol
            </div>
            <div className="border border-cyan-950 bg-black/60 p-2 rounded">
                <span className="text-white">A5/A10:</span> Rumble / Chaos Env
            </div>
            <div className="border border-cyan-950 bg-black/60 p-2 rounded">
                <span className="text-white">A6:</span> Delay Echo Void
            </div>
            <div className="border border-cyan-950 bg-black/60 p-2 rounded">
                <span className="text-white">A8:</span> Scale Pitch Modifier
            </div>
            
            <div className="border border-cyan-800 bg-cyan-950/20 p-2 rounded col-span-2 lg:col-span-4 mt-2">
                <span className="text-cyan-400 font-bold">CULTIVATION DYNAMICS:</span> At Level 1, the metronome dominates and axes act as continuous volume sliders tracking your coherence absolute amplitude.
                As you approach Level 4 (Nascent Soul), the metronome goes silent. YOU must supply raw rhythmic oscillations to trigger kicks, bass, and hats by physically or mentally CROSSING ZERO (oscillating between positive and negative domains).
            </div>
        </div>

      </div>
    </div>
  );
}
