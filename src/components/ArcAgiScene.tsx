import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, Text } from '@react-three/drei';
import { InputService } from '../lib/InputService';

const ARC_COLORS = [
    '#000000', // 0: Black (empty/eraser)
    '#0074D9', // 1: Blue
    '#FF4136', // 2: Red
    '#2ECC40', // 3: Green
    '#FFDC00', // 4: Yellow
    '#AAAAAA', // 5: Grey
    '#F012BE', // 6: Fuchsia
    '#FF851B', // 7: Orange
    '#7FDBFF', // 8: Teal
    '#85144b', // 9: Maroon
];

const PHI = (1 + Math.sqrt(5)) / 2;
const SPHERE_RADIUS = 1.2;
const ICO_VERTICES = [
    [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
    [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
    [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
].map(v => {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return new THREE.Vector3((v[0]/len)*SPHERE_RADIUS, (v[1]/len)*SPHERE_RADIUS, (v[2]/len)*SPHERE_RADIUS);
});

type NodeData = { idx: number, color: number };

function generateTargetPattern(level: number) {
    const numNodes = Math.min(3 + Math.floor(level / 2), 10);
    const pattern: NodeData[] = [];
    const used = new Set<number>();
    
    for(let i = 0; i < numNodes; i++) {
        let idx = Math.floor(Math.random() * 12);
        while(used.has(idx)) idx = Math.floor(Math.random() * 12);
        used.add(idx);
        pattern.push({ idx, color: Math.floor(Math.random() * 8) + 1 });
    }
    return pattern;
}

export default function ArcAgiScene({ 
    moveSensitivity = 1, 
    showUI = true,
}: { 
    moveSensitivity?: number, 
    showUI?: boolean
}) {
    const { camera } = useThree();
    
    useEffect(() => {
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);
    }, [camera]);

    const [score, setScore] = useState(0);
    const [level, setLevel] = useState(1);
    const [flashColor, setFlashColor] = useState<string | null>(null);

    const targetPattern = useMemo(() => generateTargetPattern(level), [level]);
    const [userNodes, setUserNodes] = useState<NodeData[]>([]);
    
    const userSphereRef = useRef<THREE.Group>(null);
    const spherePosRef = useRef(new THREE.Vector3(0, 0, 0));
    const sphereRotRef = useRef(new THREE.Euler(0, 0, 0));
    
    const colorSelectRef = useRef(1);
    const colorAccRef = useRef(0);
    const placeCooldownRef = useRef(0);
    const crosshairRef = useRef<THREE.Mesh>(null);

    useFrame((state, delta) => {
        const input = InputService.getInstance();
        let axes = input.getMultiDeviceAxes();

        // Axis 0, 1 -> Strafe (Translate Sphere X, Y)
        const strafeSpeed = 3.0 * moveSensitivity;
        spherePosRef.current.x += axes[0] * delta * strafeSpeed;
        spherePosRef.current.y -= axes[1] * delta * strafeSpeed; // Y inverted for intuitive stick controls

        // Clamp sphere position so they can't lose it off-screen
        spherePosRef.current.x = Math.max(-2, Math.min(2, spherePosRef.current.x));
        spherePosRef.current.y = Math.max(-2, Math.min(2, spherePosRef.current.y));

        // Axis 2, 3 -> Rotate Sphere (Right Stick)
        const rotSpeed = 3.0 * moveSensitivity;
        sphereRotRef.current.y += axes[2] * delta * rotSpeed;
        sphereRotRef.current.x += axes[3] * delta * rotSpeed;

        if (userSphereRef.current) {
            userSphereRef.current.position.copy(spherePosRef.current);
            userSphereRef.current.rotation.set(sphereRotRef.current.x, sphereRotRef.current.y, sphereRotRef.current.z);
        }

        // Color selection (Axis 5 - Bumpers)
        colorAccRef.current += axes[5] * delta * 8; 
        if (colorAccRef.current > 1) {
            colorSelectRef.current++;
            if (colorSelectRef.current > 9) colorSelectRef.current = 1;
            colorAccRef.current = 0;
        } else if (colorAccRef.current < -1) {
            colorSelectRef.current--;
            if (colorSelectRef.current < 1) colorSelectRef.current = 9;
            colorAccRef.current = 0;
        }
        
        if (crosshairRef.current) {
            (crosshairRef.current.material as THREE.MeshBasicMaterial).color.set(ARC_COLORS[colorSelectRef.current]);
        }

        if (placeCooldownRef.current > 0) {
            placeCooldownRef.current -= delta;
        }

        // Action (Axis 4 - Triggers)
        if (placeCooldownRef.current <= 0) {
            if (axes[4] > 0.3) { 
                // Place Node
                if (userSphereRef.current) {
                    // Crosshair is fixed at world (0, 0, 2)
                    const worldPos = new THREE.Vector3(0, 0, SPHERE_RADIUS + 0.1);
                    const localPos = userSphereRef.current.worldToLocal(worldPos);
                    
                    let closestIdx = 0;
                    let minD = 999;
                    ICO_VERTICES.forEach((v, idx) => {
                        const d = v.distanceTo(localPos);
                        if (d < minD) {
                            minD = d;
                            closestIdx = idx;
                        }
                    });
                    
                    if (minD < 0.6) {
                        setUserNodes(prev => {
                            const next = prev.filter(n => n.idx !== closestIdx);
                            return [...next, { idx: closestIdx, color: colorSelectRef.current }];
                        });
                        placeCooldownRef.current = 0.2; 
                    }
                }
            } else if (axes[4] < -0.3) { 
                // Erase Node
                if (userSphereRef.current) {
                    const worldPos = new THREE.Vector3(0, 0, SPHERE_RADIUS + 0.1);
                    const localPos = userSphereRef.current.worldToLocal(worldPos);
                    
                    let closestIdx = 0;
                    let minD = 999;
                    ICO_VERTICES.forEach((v, idx) => {
                        const d = v.distanceTo(localPos);
                        if (d < minD) {
                            minD = d;
                            closestIdx = idx;
                        }
                    });
                    
                    if (minD < 0.6) {
                        setUserNodes(prev => prev.filter(n => n.idx !== closestIdx));
                        placeCooldownRef.current = 0.2;
                    }
                }
            }
        }

        // Win check
        let allMatched = true;
        for (const tNode of targetPattern) {
            const uNode = userNodes.find(n => n.idx === tNode.idx);
            if (!uNode || uNode.color !== tNode.color) {
                allMatched = false;
                break;
            }
        }
        
        if (allMatched && targetPattern.length > 0 && userNodes.length === targetPattern.length) {
            setUserNodes([]);
            setScore(s => s + 1);
            setLevel(l => l + 1);
            setFlashColor('#2ECC40'); // Green flash
            setTimeout(() => setFlashColor(null), 300);
        }
    });

    return (
        <group>
            {flashColor && (
                <mesh position={[0,0,-5]}>
                    <planeGeometry args={[100, 100]} />
                    <meshBasicMaterial color={flashColor} transparent opacity={0.3} />
                </mesh>
            )}

            {/* Central Play Sphere */}
            <group ref={userSphereRef}>
                <mesh>
                    <sphereGeometry args={[SPHERE_RADIUS - 0.02, 32, 32]} />
                    <meshStandardMaterial color="#222222" />
                </mesh>
                <mesh>
                    <sphereGeometry args={[SPHERE_RADIUS, 16, 16]} />
                    <meshStandardMaterial color="#444" wireframe transparent opacity={0.4} />
                </mesh>
                
                {/* 12 Snap Slots (Icosahedron vertices) */}
                {ICO_VERTICES.map((v, i) => (
                    <mesh key={`slot-${i}`} position={v}>
                        <ringGeometry args={[0.1, 0.15, 16]} />
                        <meshBasicMaterial color="#555" transparent opacity={0.5} side={THREE.DoubleSide} />
                        <mesh position={[0,0,0]}>
                            <circleGeometry args={[0.05, 8]} />
                            <meshBasicMaterial color="#444" />
                        </mesh>
                    </mesh>
                ))}

                {/* Target Pattern (Ghost Nodes) */}
                {targetPattern.map((n, i) => (
                    <mesh key={`target-${i}`} position={ICO_VERTICES[n.idx]}>
                        <sphereGeometry args={[0.18, 16, 16]} />
                        <meshStandardMaterial color={ARC_COLORS[n.color]} transparent opacity={0.4} wireframe />
                        <mesh>
                            <sphereGeometry args={[0.12, 16, 16]} />
                            <meshStandardMaterial color={ARC_COLORS[n.color]} transparent opacity={0.2} />
                        </mesh>
                    </mesh>
                ))}

                {/* User Placed Nodes */}
                {userNodes.map((n, i) => (
                    <mesh key={`node-${i}`} position={ICO_VERTICES[n.idx]}>
                        <sphereGeometry args={[0.16, 16, 16]} />
                        <meshStandardMaterial color={ARC_COLORS[n.color]} />
                    </mesh>
                ))}
            </group>

            {/* Fixed Crosshair in screen center */}
            <group position={[0, 0, SPHERE_RADIUS + 0.15]}>
                <mesh ref={crosshairRef}>
                    <ringGeometry args={[0.2, 0.25, 32]} />
                    <meshBasicMaterial color="white" transparent opacity={0.8} depthTest={false} />
                </mesh>
                <mesh>
                    <circleGeometry args={[0.02, 16]} />
                    <meshBasicMaterial color="white" depthTest={false} />
                </mesh>
            </group>

            {showUI && (
                <Html calculatePosition={() => [0, 0]} style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none' }} zIndexRange={[100, 0]}>
                    <div style={{ position: 'absolute', top: '20px', right: '40px', width: '380px', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                        <div style={{ color: '#F012BE', fontFamily: 'monospace', fontSize: '28px', fontWeight: 'bold', textShadow: '0px 0px 8px #F012BE' }}>
                           ARC AGI LEVEL {level} <br/>
                           <span style={{ fontSize: '18px', color: '#fff' }}>ORBITAL MATCH</span><br/>
                           SCORE: {score}
                        </div>

                        <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: '12px', marginTop: 30, background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '6px', border: '1px solid #444', textAlign: 'left' }}>
                           <strong style={{ color: '#7FDBFF' }}>MATCH THE PATTERN</strong><br/>
                           Fill the flashing ghost nodes with the matching color.<br/><br/>
                           <strong style={{ color: '#7FDBFF' }}>NEURO-CONTROLS</strong><br/>
                           Axis 0/1 (L-Stick): Strafe Sphere<br/>
                           Axis 2/3 (R-Stick): Rotate Sphere<br/>
                           Axis 5 (Bumpers): Select Color<br/>
                           Axis 4 (Triggers): Place / Erase Node<br/>
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}
