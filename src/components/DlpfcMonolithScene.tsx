import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BleService } from '../lib/BleService';
import { InputService } from '../lib/InputService';
import { Text } from '@react-three/drei';
import { XR } from '@react-three/xr';
import { globalXrStore as xrStore } from '../lib/xrStore';

interface ModalityProps {
    driftRef: React.RefObject<Float32Array>;
    moveSensitivity: number;
    audioEngine?: any;
}

const MonolithMatrix = ({ audioEngine }: ModalityProps) => {
    const groupRef = useRef<THREE.Group>(null);
    const [status, setStatus] = useState({ density: 0, integrity: 100 });
    const integrityRef = useRef(100);
    const pulsePhase = useRef(0);
    
    useFrame((state, delta) => {
        if (!groupRef.current) return;
        const ble = BleService.getInstance();
        const input = InputService.getInstance();
        
        let gammaDensity = 0;
        const axes = new Float32Array(16);
        
        if (ble.isConnected && ble.futureAxes) {
            for (let i = 0; i < ble.futureAxes.length; i++) {
                axes[i] = ble.futureAxes[i] || 0;
                gammaDensity += Math.abs(axes[i]);
            }
        } else {
            for (let i = 0; i < input.rawAxes.length; i++) {
                axes[i] = input.rawAxes[i] || 0;
                gammaDensity += Math.abs(axes[i]);
            }
        }
        
        const densityNorm = Math.min(gammaDensity / 8.0, 1.0);
        
        // 100% deterministic positioning based purely on input state
        for (let i = 0; i < 16; i++) {
            const pillar = groupRef.current.children[i] as THREE.Mesh;
            const axisVal = axes[i];
            
            // visually smooth the pillars so it doesn't flicker instantly on keyboard press, but keep logic deterministic
            const targetHeight = Math.abs(axisVal) * 5.0 + 0.1;
            pillar.scale.y += (targetHeight - pillar.scale.y) * Math.min(1.0, delta * 10.0);
            pillar.position.y = pillar.scale.y / 2;
            
            const mat = pillar.material as THREE.MeshPhysicalMaterial;
            // Shield color changes exactly based on individual input component
            if (axisVal > 0.1) {
                mat.color.lerp(new THREE.Color(0x00aaff), Math.min(1.0, delta * 10.0));
                mat.transmission = 0.2;
            } else if (axisVal < -0.1) {
                mat.color.lerp(new THREE.Color(0xff00aa), Math.min(1.0, delta * 10.0));
                mat.transmission = 0.2;
            } else {
                mat.color.lerp(new THREE.Color(0x222222), Math.min(1.0, delta * 10.0));
                mat.transmission = 0.9;
            }
        }

        const simulatedImpact = (Math.abs(axes[4] || 0) + Math.abs(axes[5] || 0)) > 1.0 ? 1 : 0;
        
        // Deterministic attacks based on continuous time passing phase (Pulse).
        // Since we can't use random, we use a fixed sine wave attack that requires high density to block.
        pulsePhase.current += delta;
        const attackWave = Math.sin(pulsePhase.current * 2.0);
        
        let damage = 0;
        if (attackWave > 0.8) {
            // Under attack!
            if (densityNorm < 0.6) {
                damage = 10 * delta; // Took damage if shield isn't dense enough
            }
        }
        
        if (densityNorm > 0.8 && attackWave <= 0.8) {
            // Repair if deeply focused when not attacked
            damage = -2 * delta; 
        }

        integrityRef.current = Math.max(0, Math.min(100, integrityRef.current - damage));
        
        setStatus({
            density: densityNorm,
            integrity: integrityRef.current
        });

        if (audioEngine) {
            audioEngine.updateDlpfcMonolith(densityNorm, simulatedImpact);
        }
    });

    return (
        <group>
            <group ref={groupRef}>
                {Array.from({ length: 16 }).map((_, i) => {
                    const row = Math.floor(i / 4);
                    const col = i % 4;
                    const x = (col - 1.5) * 2;
                    const z = (row - 1.5) * 2;
                    return (
                        <mesh key={i} position={[x, 0, z]}>
                            <boxGeometry args={[1.5, 1, 1.5]} />
                            <meshPhysicalMaterial 
                                color="#222222" 
                                transmission={0.9} 
                                opacity={1} 
                                transparent 
                                roughness={0.1} 
                                thickness={1.0} 
                            />
                        </mesh>
                    );
                })}
            </group>

            <Text position={[0, -2, 5]} fontSize={0.5} color={status.integrity < 30 ? "#ff0000" : (status.density > 0.6 ? "#00ffaa" : "#88ccff")} anchorX="center" anchorY="bottom">
                Monolith Integrity: {status.integrity.toFixed(0)}%
            </Text>
            <Text position={[0, -2.8, 5]} fontSize={0.3} color="#aaa" anchorX="center" anchorY="bottom">
                Density (Gamma): {(status.density * 100).toFixed(1)}%
            </Text>
        </group>
    );
};

export function DlpfcMonolithScene(props: ModalityProps) {
    return (
        <div className="w-full h-full absolute inset-0 z-0">
            <Canvas camera={{ position: [0, 15, 15] }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)} gl={{ preserveDrawingBuffer: true }}>
                <color attach="background" args={['#050510']} />
                <ambientLight intensity={0.5} />
                <pointLight position={[0, 20, 0]} intensity={2} />
                <MonolithMatrix {...props} />
            </Canvas>
        </div>
    );
}
