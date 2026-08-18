import React, { useEffect, useState } from 'react';
import { dotProduct } from '../lib/clipHelper';

export const SemanticRadar = ({ driftRef, movementAxes }: { driftRef: any, movementAxes?: Float32Array[] }) => {
    const [vals, setVals] = useState({fw: 0, bw: 0, left: 0, right: 0, cw: 0, ccw: 0});

    useEffect(() => {
        const interval = setInterval(() => {
            if (movementAxes && movementAxes.length >= 3 && driftRef.current) {
                // movementAxes are:
                // 0: A0 (Right - Left) (Positive is Right, Negative is Left)
                // 1: A1 (Back - Forward) (Negative is Forward)
                // 2: A2 (Turn Right - Turn Left) (Positive is Turn Right)

                const rightAxis = dotProduct(driftRef.current, movementAxes[0]) * 50.0;
                const backAxis = dotProduct(driftRef.current, movementAxes[1]) * 50.0;
                const rotateAxis = dotProduct(driftRef.current, movementAxes[2]) * 50.0;
                
                setVals({
                    fw: Math.max(-1, Math.min(1, -backAxis)),
                    bw: Math.max(-1, Math.min(1, backAxis)),
                    left: Math.max(-1, Math.min(1, -rightAxis)),
                    right: Math.max(-1, Math.min(1, rightAxis)),
                    cw: Math.max(-1, Math.min(1, rotateAxis)),
                    ccw: Math.max(-1, Math.min(1, -rotateAxis))
                });
            }
        }, 100);
        return () => clearInterval(interval);
    }, [driftRef, movementAxes]);

    if (!movementAxes || movementAxes.length < 3) return null;

    return (
        <div className="absolute top-20 right-4 p-4 bg-black/60 rounded border border-white/10 font-mono text-[10px] text-white z-50 pointer-events-none">
            <div className="text-emerald-400 mb-2 border-b border-gray-600 pb-1 font-bold">SEMANTIC RADAR DECAY</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>FW: {(vals.fw * 100).toFixed(0)}%</div>
                <div>BW: {(vals.bw * 100).toFixed(0)}%</div>
                <div>LT: {(vals.left * 100).toFixed(0)}%</div>
                <div>RT: {(vals.right * 100).toFixed(0)}%</div>
                <div>CW: {(vals.cw * 100).toFixed(0)}%</div>
                <div>CCW: {(vals.ccw * 100).toFixed(0)}%</div>
            </div>
            <div className="mt-2 text-[9px] text-gray-500">Should react smoothly to WASD.</div>
        </div>
    );
};
