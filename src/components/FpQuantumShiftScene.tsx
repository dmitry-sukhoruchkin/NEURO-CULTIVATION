import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import { globalXrStore as xrStore } from '../lib/xrStore';
import * as THREE from 'three';
import { InputService } from '../lib/InputService';
import { BleService } from '../lib/BleService';
import { Text } from '@react-three/drei';

interface ModalityProps {
    driftRef: React.RefObject<Float32Array>;
    moveSensitivity: number;
    audioEngine?: any;
}

const QuantumVisualizer = ({ audioEngine }: ModalityProps) => {
    const linesRef = useRef<THREE.Group>(null);
    const pastNodesRef = useRef<THREE.Group>(null);
    const futureNodesRef = useRef<THREE.Group>(null);
    
    const [realm, setRealm] = useState<0 | 1>(0);
    const [rigidityVal, setRigidityVal] = useState(1.0);
    const [shifts, setShifts] = useState(0);
    
    // For gamepad fallback
    const gamepadPastRef = useRef(new Float32Array(16));
    const lastRigidityRef = useRef(1.0);
    
    useFrame((state, delta) => {
        const ble = BleService.getInstance();
        const input = InputService.getInstance();
        
        let pastAxes: Float32Array;
        let futureAxes: Float32Array;

        if (ble.isConnected && ble.pastAxes && ble.futureAxes) {
            pastAxes = ble.pastAxes;
            futureAxes = ble.futureAxes;
        } else {
            // Gamepad metaphor
            futureAxes = input.rawAxes;
            if (futureAxes[6] < -0.5) {
                // User pressed Button X (or Spacebar if keyboard)
                for (let i = 0; i < 16; i++) gamepadPastRef.current[i] = futureAxes[i];
            }
            pastAxes = gamepadPastRef.current;
        }

        let normPastSq = 0;
        let normFutureSq = 0;
        let dotProduct = 0;
        
        for (let i = 0; i < 16; i++) {
            const p = pastAxes[i] || 0;
            const f = futureAxes[i] || 0;
            normPastSq += p * p;
            normFutureSq += f * f;
            dotProduct += p * f;
        }

        let rigidity = 1.0;
        if (normPastSq > 0.1 && normFutureSq > 0.1) {
            rigidity = dotProduct / (Math.sqrt(normPastSq) * Math.sqrt(normFutureSq));
        }

        let triggeredShift = false;
        
        // Structure updates
        if (pastNodesRef.current && futureNodesRef.current) {
            for (let i = 0; i < 16; i++) {
                const pastMesh = pastNodesRef.current.children[i] as THREE.Mesh;
                const futureMesh = futureNodesRef.current.children[i] as THREE.Mesh;
                
                // Visual smoothing of scale to avoid frantic keyboard flickering, logic is deterministic
                const targetPastScale = Math.abs(pastAxes[i]) * 4 + 0.1;
                const targetFutureScale = Math.abs(futureAxes[i]) * 4 + 0.1;

                pastMesh.scale.y += (targetPastScale - pastMesh.scale.y) * Math.min(1.0, delta * 15.0);
                futureMesh.scale.y += (targetFutureScale - futureMesh.scale.y) * Math.min(1.0, delta * 15.0);

                // Color node by polarity
                (pastMesh.material as THREE.MeshStandardMaterial).color.setHSL(pastAxes[i] > 0 ? 0.6 : 0.0, 1.0, 0.5);
                (futureMesh.material as THREE.MeshStandardMaterial).color.setHSL(futureAxes[i] > 0 ? 0.6 : 0.0, 1.0, 0.5);
            }
        }

        if (lastRigidityRef.current > 0.7 && rigidity < 0.2) {
            // SHIFT!
            setRealm(prev => prev === 0 ? 1 : 0);
            triggeredShift = true;
            // Update gamepad past
            for (let i = 0; i < 16; i++) gamepadPastRef.current[i] = futureAxes[i];
            setShifts(prev => prev + 1);
        } 
        
        // If neutral for a while, save context as past
        if (normFutureSq < 0.1 && ble.isConnected === false) {
             for (let i = 0; i < 16; i++) gamepadPastRef.current[i] = 0;
        }

        lastRigidityRef.current = rigidity;
        setRigidityVal(rigidity);

        if (audioEngine) {
            audioEngine.updateFpQuantum(realm === 1, triggeredShift);
        }
    });

    const isLava = realm === 0;
    const requiredShifts = 7;

    return (
        <group>
            {/* Background Environment (The "Realm" that switches) */}
            <mesh position={[0, -5, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial 
                    color={isLava ? "#ff2200" : "#88ccff"} 
                    emissive={isLava ? "#aa0000" : "#004488"} 
                    roughness={isLava ? 1.0 : 0.0}
                    metalness={isLava ? 0.0 : 1.0}
                />
            </mesh>

            {/* Visualizer Structure - 100% real-time reflection */}
            <Text position={[0, -4, 0]} color={shifts >= requiredShifts ? "#00ffcc" : "#fff"} fontSize={0.5} anchorX="center" anchorY="bottom">
                {shifts >= requiredShifts ? "QUANTUM REALM BREACHED" : `SHIFTS (ORTHOGONAL JUMPS) : ${shifts} / ${requiredShifts}`}
            </Text>

            <Text position={[0, 4, -5]} color="white" fontSize={1} anchorX="center" anchorY="middle">
                Rigidity: {rigidityVal.toFixed(2)}
            </Text>

            <group position={[0, 1, -5]}>
                <Text position={[-10, 2, 0]} color="#aaa" fontSize={0.5}>PAST</Text>
                <group ref={pastNodesRef}>
                    {Array.from({ length: 16 }).map((_, i) => (
                        <mesh key={'past_'+i} position={[(i - 7.5) * 1.2, 2, 0]}>
                            <boxGeometry args={[0.8, 1, 0.8]} />
                            <meshStandardMaterial color="#888" />
                        </mesh>
                    ))}
                </group>

                <Text position={[-10, -2, 0]} color="#aaa" fontSize={0.5}>FUTURE</Text>
                <group ref={futureNodesRef}>
                    {Array.from({ length: 16 }).map((_, i) => (
                        <mesh key={'future_'+i} position={[(i - 7.5) * 1.2, -2, 0]}>
                            <boxGeometry args={[0.8, 1, 0.8]} />
                            <meshStandardMaterial color="#888" />
                        </mesh>
                    ))}
                </group>
            </group>
        </group>
    );
};

export function FpQuantumShiftScene(props: ModalityProps) {
    return (
        <div className="w-full h-full absolute inset-0 z-0">
            <Canvas camera={{ position: [0, 1, 15] }} gl={{ preserveDrawingBuffer: true }}>
                <color attach="background" args={['#000']} />
                <ambientLight intensity={0.5} />
                <pointLight position={[0, 10, 5]} intensity={2} />
                <QuantumVisualizer {...props} />
            </Canvas>
        </div>
    );
}
