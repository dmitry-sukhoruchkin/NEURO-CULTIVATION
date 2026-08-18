import React, { useEffect, useRef, useState } from 'react';
import { BleService } from '../lib/BleService';

export const WorkingMemoryDiagnostics = ({ show, onClose }: { show: boolean, onClose: () => void }) => {
    const radarCanvasRef = useRef<HTMLCanvasElement>(null);
    const fieldCanvasRef = useRef<HTMLCanvasElement>(null);
    const [stats, setStats] = useState({ consensus: 0, maxChannels: 0, drift: 0 });

    useEffect(() => {
        if (!show) return;
        
        let animFrame: number;
        const bleService = BleService.getInstance();
        
        // Pseudo-PCA projection matrix (120 -> 2)
        const projMatrix = Array.from({ length: 120 }, (_, i) => [
            Math.cos(i * 13.7) * 2.0, 
            Math.sin(i * 19.3) * 2.0
        ]);
        
        const pathHistory: {x: number, y: number}[] = [];
        const maxHistory = 100;

        const update = () => {
            const radarCtx = radarCanvasRef.current?.getContext('2d');
            const fieldCtx = fieldCanvasRef.current?.getContext('2d');
            if (!radarCtx || !fieldCtx || !radarCanvasRef.current || !fieldCanvasRef.current) return;
            
            const numPairs = bleService.rawAxes ? bleService.rawAxes.length : 0;
            const numChannels = bleService.numChannels || 0;
            
            setStats({
                consensus: bleService.topologicalConsensus || 0,
                maxChannels: numChannels,
                drift: bleService.topologicalConsensus > 0 && numPairs > 0 ? 100 - (bleService.topologicalConsensus / numPairs * 100) : 0
            });

            // 1. Calculate 2D Projection (Latent Intent)
            let px = 0, py = 0;
            if (numPairs > 0 && bleService.futureAxes) {
                for (let i = 0; i < Math.min(numPairs, 120); i++) {
                    const val = bleService.futureAxes[i] || 0;
                    px += val * projMatrix[i][0];
                    py += val * projMatrix[i][1];
                }
                px *= 0.1; py *= 0.1;
                
                pathHistory.push({x: px, y: py});
                if (pathHistory.length > maxHistory) pathHistory.shift();
            }

            // 2. Render Radar (Mind Vine)
            const rw = radarCanvasRef.current.width;
            const rh = radarCanvasRef.current.height;
            radarCtx.fillStyle = '#0a0a0f';
            radarCtx.fillRect(0, 0, rw, rh);
            
            radarCtx.strokeStyle = '#1f2937';
            radarCtx.lineWidth = 1;
            radarCtx.beginPath();
            radarCtx.moveTo(rw/2, 0); radarCtx.lineTo(rw/2, rh);
            radarCtx.moveTo(0, rh/2); radarCtx.lineTo(rw, rh/2);
            radarCtx.stroke();
            radarCtx.beginPath();
            radarCtx.arc(rw/2, rh/2, rh/3, 0, Math.PI*2);
            radarCtx.stroke();
            
            if (pathHistory.length > 1) {
                radarCtx.beginPath();
                for (let i = 0; i < pathHistory.length; i++) {
                    const pt = pathHistory[i];
                    const drawX = rw/2 + pt.x * (rw/4);
                    const drawY = rh/2 + pt.y * (rh/4);
                    if (i === 0) radarCtx.moveTo(drawX, drawY);
                    else radarCtx.lineTo(drawX, drawY);
                }
                const grad = radarCtx.createLinearGradient(0, 0, rw, rh);
                grad.addColorStop(0, '#0ea5e9'); // cyan (past origin)
                grad.addColorStop(1, '#ec4899'); // pink (future head)
                radarCtx.strokeStyle = grad;
                radarCtx.lineWidth = 3;
                radarCtx.stroke();
                
                const head = pathHistory[pathHistory.length - 1];
                radarCtx.fillStyle = '#fff';
                radarCtx.beginPath();
                radarCtx.arc(rw/2 + head.x * (rw/4), rh/2 + head.y * (rh/4), 4, 0, Math.PI*2);
                radarCtx.fill();
            }

            // 3. Render Topology Field (16x16 Matrix Heatmap)
            const fw = fieldCanvasRef.current.width;
            const fh = fieldCanvasRef.current.height;
            fieldCtx.fillStyle = '#000000';
            fieldCtx.fillRect(0, 0, fw, fh);
            
            if (numChannels > 0 && numPairs > 0 && bleService.futureAxes && bleService.pastAxes) {
                const cellSize = Math.min(fw / numChannels, fh / numChannels);
                const xOffset = (fw - cellSize * numChannels) / 2;
                const yOffset = (fh - cellSize * numChannels) / 2;
                
                let pairIdx = 0;
                for (let i = 0; i < numChannels; i++) {
                    for (let j = i + 1; j < numChannels; j++) {
                        const val = bleService.futureAxes[pairIdx] || 0;
                        const pastVal = bleService.pastAxes[pairIdx] || 0;
                        
                        // FUTURE MATRIX (Upper right)
                        const intensity = Math.abs(val) * 2;
                        const r = val > 0 ? 236 * intensity : 14 * intensity;
                        const g = val > 0 ? 72 * intensity : 165 * intensity;
                        const b = val > 0 ? 153 * intensity : 233 * intensity;
                        fieldCtx.fillStyle = `rgb(${r},${g},${b})`;
                        fieldCtx.fillRect(xOffset + j * cellSize, yOffset + i * cellSize, cellSize - 1, cellSize - 1);
                        
                        // PAST MATRIX (Lower left)
                        const pIntensity = Math.abs(pastVal) * 2;
                        const pr = pastVal > 0 ? 236 * pIntensity : 14 * pIntensity;
                        const pg = pastVal > 0 ? 72 * pIntensity : 165 * pIntensity;
                        const pb = pastVal > 0 ? 153 * pIntensity : 233 * pIntensity;
                        fieldCtx.fillStyle = `rgb(${pr},${pg},${pb})`;
                        fieldCtx.fillRect(xOffset + i * cellSize, yOffset + j * cellSize, cellSize - 1, cellSize - 1);
                        
                        pairIdx++;
                    }
                    
                    // Diagonal line
                    fieldCtx.fillStyle = '#333';
                    fieldCtx.fillRect(xOffset + i * cellSize, yOffset + i * cellSize, cellSize - 1, cellSize - 1);
                }
            }

            animFrame = requestAnimationFrame(update);
        };
        
        update();
        return () => cancelAnimationFrame(animFrame);
    }, [show]);

    if (!show) return null;

    return (
        <div className="absolute left-4 top-20 bottom-20 w-[450px] max-w-full bg-black/90 border border-gray-700 z-50 rounded flex flex-col pointer-events-auto shadow-2xl overflow-hidden">
            <div className="flex flex-col p-3 border-b border-gray-800 bg-gray-900/80">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-cyan-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                        Working Memory Analytics
                    </span>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-white px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs transition-colors border border-gray-600"
                    >
                        CLOSE
                    </button>
                </div>
                <div className="text-xs text-gray-400 grid grid-cols-2 gap-x-4 gap-y-1">
                    <div className="flex justify-between">
                        <span>Pairs Active:</span>
                        <span className="text-white font-mono">{stats.maxChannels > 0 ? (stats.maxChannels * (stats.maxChannels - 1)) / 2 : 0}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Phase Consensus:</span>
                        <span className="text-cyan-400 font-mono">{stats.consensus}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Instability:</span>
                        <span className="text-pink-400 font-mono">{stats.drift.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto">
                <div className="flex flex-col h-1/2 min-h-[250px]">
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 flex justify-between">
                        <span>Latent Intent Radar (2D Projection)</span>
                        <span className="text-cyan-500 font-bold">Mind Vine</span>
                    </div>
                    <div className="flex-1 border border-gray-800 rounded bg-[#0a0a0f] relative overflow-hidden">
                        <canvas 
                            ref={radarCanvasRef} 
                            width={420} 
                            height={300} 
                            className="absolute inset-0 w-full h-full"
                        />
                    </div>
                </div>

                <div className="flex flex-col h-1/2 min-h-[250px]">
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 flex justify-between">
                        <span>Phase Field Topology (16x16 Matrix)</span>
                        <span className="flex gap-2">
                            <span className="text-cyan-500 font-bold">PAST</span>
                            <span className="text-pink-500 font-bold">FUTURE</span>
                        </span>
                    </div>
                    <div className="flex-1 border border-gray-800 rounded bg-[#000] relative overflow-hidden">
                        <canvas 
                            ref={fieldCanvasRef} 
                            width={420} 
                            height={300} 
                            className="absolute inset-0 w-full h-full"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
