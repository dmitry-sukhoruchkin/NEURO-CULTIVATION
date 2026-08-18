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

const RailgunCoil = ({ audioEngine }: ModalityProps) => {
    const groupRef = useRef<THREE.Group>(null);
    const beamRef = useRef<THREE.Mesh>(null);
    const chargeState = useRef({ fired: 0, cooldown: 0 });
    const segments = 16;
    const [chargeStatus, setChargeStatus] = useState({ density: 0, isFiring: false, canFire: true });
    
    useFrame((state, delta) => {
        if (!groupRef.current || !beamRef.current) return;
        const ble = BleService.getInstance();
        const input = InputService.getInstance();
        
        let targetX = 0;
        let targetY = 0;
        let totalDensity = 0;
        const axes = new Float32Array(16);
        
        if (ble.isConnected && ble.futureAxes) {
            targetX = ble.target_vx || 0;
            targetY = ble.target_vy || 0;
            for (let i = 0; i < ble.futureAxes.length; i++) {
                axes[i] = ble.futureAxes[i] || 0;
                totalDensity += Math.abs(axes[i]);
            }
        } else {
            targetX = input.rawAxes[0] || 0;
            targetY = input.rawAxes[1] || 0;
            for (let i = 0; i < input.rawAxes.length; i++) {
                // simple smoothing for visual keyboard
                axes[i] = input.rawAxes[i] || 0;
                if (i >= 2) totalDensity += Math.abs(axes[i]);
            }
        }
        
        const vectorMag = Math.sqrt(targetX*targetX + targetY*targetY);
        let justFired = false;
        
        // Instant visual mapping to the coil structure
        for (let i = 0; i < segments; i++) {
            const ring = groupRef.current.children[i] as THREE.Mesh;
            
            // Apply smoothing ONLY to the visual node rotation so keyboard isn't blinking instantly,
            // but keep the logic mathematically strict on axes.
            const axisVal = axes[i % axes.length];
            ring.rotation.z += (axisVal * Math.PI - ring.rotation.z) * Math.min(1.0, delta * 15.0); 
            
            const mat = ring.material as THREE.MeshStandardMaterial;
            
            // If they are holding a strong strict null space (vector 0, high density)
            const isNullSpacePrep = vectorMag < 0.1 && totalDensity > 0.5;
            
            if (isNullSpacePrep) {
                mat.emissiveIntensity = Math.abs(axisVal) * 2.0;
                mat.emissive.setHSL(0.05, 1.0, 0.4);
            } else {
                mat.emissiveIntensity = Math.abs(axisVal) * 0.5;
                mat.emissive.setHSL(0.6, 1.0, 0.2);
            }
            // Size also instantly maps
            const s = 1.0 + Math.abs(axisVal);
            ring.scale.set(s, s, 1);
        }
        
        chargeState.current.cooldown = Math.max(0, chargeState.current.cooldown - delta);

        if (vectorMag > 0.8 && totalDensity > 0.5 && chargeState.current.cooldown <= 0) {
            // Fired!
            chargeState.current.fired = 1.0;
            chargeState.current.cooldown = 1.0; // Cooldown to avoid 60fps spamming
            justFired = true;
        }
        
        if (audioEngine) {
            audioEngine.updateCzRailgun(totalDensity, justFired);
        }
        
        // Beam is pure deterministic visual state based on firing trigger
        if (chargeState.current.fired > 0) {
            beamRef.current.scale.z = chargeState.current.fired * 100.0;
            (beamRef.current.material as THREE.MeshBasicMaterial).opacity = chargeState.current.fired;
            chargeState.current.fired -= delta * 5.0; 
        } else {
            beamRef.current.scale.z = 0.001;
            (beamRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
        }

        setChargeStatus({
            density: totalDensity,
            isFiring: chargeState.current.fired > 0,
            canFire: chargeState.current.cooldown <= 0
        });
    });

    const isNullSpacePrep = chargeStatus.density > 0.5;
    const reqText = isNullSpacePrep ? (chargeStatus.canFire ? "READY TO FIRE!" : "RECHARGING...") : "ENTER NULL SPACE (Hold axes neutral, raise coherence)";

    return (
        <group>
            <group ref={groupRef} position={[0, 0, 0]}>
                {Array.from({ length: segments }).map((_, i) => (
                    <mesh key={i} position={[0, 0, -i * 0.5]}>
                        <torusGeometry args={[1 + (i * 0.02), 0.1, 16, 32]} />
                        <meshStandardMaterial color="#222" emissive="#000" />
                    </mesh>
                ))}
            </group>
            <mesh ref={beamRef} position={[0, 0, -50]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.5, 0.5, 100, 16]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0} />
            </mesh>

            <Text position={[0, -2.5, 0]} fontSize={0.2} color={isNullSpacePrep ? (chargeStatus.canFire ? "#00ffaa" : "#ffaa00") : "#888"} anchorX="center" anchorY="bottom">
                {reqText}
            </Text>
            <Text position={[0, -3.0, 0]} fontSize={0.15} color="#aaa" anchorX="center" anchorY="bottom">
                Coherence Density: {Math.max(0, Math.min(100, (chargeStatus.density / 10.0) * 100)).toFixed(1)}%
            </Text>
        </group>
    );
};

export function CzRailgunScene(props: ModalityProps) {
    return (
        <div className="w-full h-full absolute inset-0 z-0">
            <Canvas camera={{ position: [0, 5, 10] }} onCreated={({ camera }) => camera.lookAt(0, 0, -5)} gl={{ preserveDrawingBuffer: true }}>
                <color attach="background" args={['#050505']} />
                <ambientLight intensity={0.5} />
                <pointLight position={[0, 5, -5]} intensity={2} />
                <RailgunCoil {...props} />
            </Canvas>
        </div>
    );
}
