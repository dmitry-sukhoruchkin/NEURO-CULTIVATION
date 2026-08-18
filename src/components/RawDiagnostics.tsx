import React, { useEffect, useRef, useState } from 'react';
import { BleService } from '../lib/BleService';

export const RawDiagnostics = ({ show, onClose }: { show: boolean, onClose: () => void }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isSaturated, setIsSaturated] = useState<boolean[]>([]);

    useEffect(() => {
        if (!show) return;
        
        let animFrame: number;
        const bleService = BleService.getInstance();

        const update = () => {
            if (!canvasRef.current) return;
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;
            
            const numChannels = bleService.totalChannels;
            if (numChannels === 0) {
                animFrame = requestAnimationFrame(update);
                return;
            }
            
            const satStatus: boolean[] = [];
            const width = canvasRef.current.width;
            const height = canvasRef.current.height;
            
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);

            const rowHeight = height / numChannels;
            
            for (let i = 0; i < numChannels; i++) {
                const buf = bleService.eegBuffer[i];
                if (!buf || buf.length === 0) continue;
                
                const len = buf.length;
                let minVal = Infinity;
                let maxVal = -Infinity;
                
                // Find min/max in the actual buffer
                for (let x = 0; x < len; x++) {
                    const val = buf[x];
                    if (val < minVal) minVal = val;
                    if (val > maxVal) maxVal = val;
                }
                
                const satThreshold = 299000;
                satStatus[i] = Math.max(Math.abs(minVal), Math.abs(maxVal)) > satThreshold;
                
                let spread = maxVal - minVal;
                if (spread < 50) spread = 50; 
                
                const yOffset = i * rowHeight;
                
                ctx.beginPath();
                for (let x = 0; x < len; x++) {
                    const val = buf[x];
                    const normalized = (val - minVal) / spread; 
                    const drawY = yOffset + rowHeight * 0.9 - (normalized * rowHeight * 0.8);
                    
                    if (x === 0) ctx.moveTo((x / len) * width, drawY);
                    else ctx.lineTo((x / len) * width, drawY);
                }
                
                ctx.strokeStyle = satStatus[i] ? '#ef4444' : '#10b981';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                ctx.strokeStyle = '#333333';
                ctx.beginPath();
                ctx.moveTo(0, yOffset + rowHeight);
                ctx.lineTo(width, yOffset + rowHeight);
                ctx.stroke();
                
                ctx.fillStyle = satStatus[i] ? '#ef4444' : '#10b981';
                ctx.font = '10px monospace';
                ctx.fillText(`CH${i} ${satStatus[i] ? 'SATURATED' : 'OK'} (${Math.round(spread)}uV)`, 5, yOffset + 12);
            }

            setIsSaturated(satStatus);
            animFrame = requestAnimationFrame(update);
        };
        
        update();
        return () => cancelAnimationFrame(animFrame);
    }, [show]);

    if (!show) return null;

    const satCount = isSaturated.filter(v => v).length;
    const total = isSaturated.length;

    return (
        <div className="absolute right-4 top-20 bottom-20 w-[600px] max-w-full bg-black/90 border border-gray-700 z-50 rounded flex flex-col pointer-events-auto shadow-2xl">
            <div className="flex justify-between items-center p-2 border-b border-gray-800 bg-gray-900/50">
                <span className="text-cyan-400 font-bold text-xs uppercase flex items-center gap-2">
                    Raw ADC (Auto-Scaled)
                    <span className="text-[9px] px-2 py-0.5 rounded bg-black border border-gray-700">
                        {satCount > 0 ? (
                            <span className="text-red-400 animate-pulse">{satCount} / {total} SATURATED</span>
                        ) : (
                            <span className="text-green-400">ALL {total} OK</span>
                        )}
                    </span>
                </span>
                
                <button 
                    onClick={onClose}
                    className="text-gray-400 hover:text-white px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-xs transition-colors"
                >
                    CLOSE
                </button>
            </div>
            <div className="flex-1 relative">
                <canvas 
                    ref={canvasRef} 
                    width={600} 
                    height={800} 
                    className="w-full h-full"
                />
            </div>
        </div>
    );
};
