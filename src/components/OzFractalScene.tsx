import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BleService } from '../lib/BleService';
import { InputService } from '../lib/InputService';
import { Text } from '@react-three/drei';
import { CultivationEngine } from '../lib/CultivationEngine';
import { XR } from '@react-three/xr';
import { globalXrStore as xrStore } from '../lib/xrStore';

interface ModalityProps {
    driftRef: React.RefObject<Float32Array>;
    moveSensitivity: number;
    audioEngine?: any;
}

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform float uAxes[16];
uniform vec2 uResolution;
uniform float uChaos;
varying vec2 vUv;

mat2 rot(float a) {
    return mat2(cos(a), -sin(a), sin(a), cos(a));
}

void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / uResolution.y;
    
    // Zoom driven by axes
    float zoom = 5.0 - (uAxes[2] + uAxes[4]) * 3.0 + (uChaos * 1.5); 
    vec3 ro = vec3(0.0, 0.0, -zoom); 
    vec3 rd = normalize(vec3(uv, 1.0));
    
    // Base camera rotation from axes - chaos makes it spinier
    rd.xy *= rot(uAxes[0] * 1.57 * (1.0 + uChaos));
    rd.yz *= rot(uAxes[1] * 1.57 * (1.0 + uChaos));
    
    float t = 0.0;
    float iterCol = 0.0;
    
    for(int i=0; i<60; i++) {
        vec3 p = ro + rd * t;
        
        // Fractal folding using the 16 axes deterministically + Chaotic space warping
        vec3 q = p;
        for(int j=0; j<5; j++) {
            float fj = float(j);
            q = abs(q) - 1.0 - (uChaos * 0.3 * sin(fj * 2.0));
            // Add chaotic twist based on level
            q.xy *= rot(uAxes[5 + j] * 1.57 + (uChaos * fj * 0.5));
            q.xz *= rot(uAxes[9 + j] * 1.57 - (uChaos * fj * 0.3));
        }
        
        float baseScale = 0.5 + abs(uAxes[15]) * 0.5 + (uChaos * 0.2);
        float d = (length(q) - baseScale) * 0.2; 
        
        if(d < 0.001 || t > 20.0) {
            iterCol = float(i) / 60.0;
            break;
        }
        t += d;
    }
    
    vec3 col = vec3(0.0);
    if(t < 20.0) {
        // Color driven purely by interaction structure, no random or automatic time
        col = vec3(0.2 + uAxes[4] + uChaos*0.3, 0.8 - abs(uAxes[5]), 1.0) * (1.0 - iterCol);
        col += vec3(0.5 - uChaos*0.2, 0.2 + uChaos*0.5, 0.8) * abs(uAxes[6]);
        
        // Add wild spectral colors when chaos is high
        col += vec3(sin(iterCol * 20.0 + uChaos * 10.0), cos(iterCol * 15.0 - uChaos * 5.0), sin(iterCol * 5.0 + uChaos * 8.0)) * uChaos * 0.6;
    }
    
    // Vignette
    col *= 1.0 - dot(uv, uv) * 0.15;
    
    gl_FragColor = vec4(col, 1.0);
}
`;

const FractalSDF = ({ driftRef, audioEngine }: ModalityProps) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const [alignment, setAlignment] = useState(0);
    
    const uniforms = useMemo(() => ({
        uAxes: { value: new Float32Array(16).fill(0) },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uChaos: { value: 0.0 }
    }), []);

    useFrame((state, delta) => {
        const ble = BleService.getInstance();
        const input = InputService.getInstance();
        const ce = CultivationEngine.getInstance();
        
        const currentAxes = uniforms.uAxes.value;

        // Calculate continuous chaos
        const exactLevel = ce.level - 1 + ce.progress;
        const chaos = Math.min(1.0, Math.max(0.0, exactLevel / 3.0));
        uniforms.uChaos.value += (chaos - uniforms.uChaos.value) * 0.1; // Smooth interpolate chaos

        let curAlign = 0;
        for(let i=0; i<16; i++) {
            let target = 0;
            if (ble.isConnected && ble.futureAxes) {
                target = ble.futureAxes[i] || 0;
            } else {
                target = input.rawAxes[i] || 0;
            }

            // Blend raw inputs with high-dimensional semantic chaos mapping
            if (chaos > 0.01 && driftRef.current && driftRef.current.length >= 16) {
                const drift = driftRef.current;
                const chunkSize = Math.floor(drift.length / 16);
                let sum = 0;
                for(let j=0; j<chunkSize; j++) {
                    sum += drift[i * chunkSize + j];
                }
                const semanticVal = sum * 2.0; 
                target = target * (1.0 - chaos) + semanticVal * chaos;
            }

            if (ble.isConnected) {
                currentAxes[i] += (target - currentAxes[i]) * 0.1;
            } else {
                // Smooth for keyboard/mouse to avoid jarring fractal snaps
                currentAxes[i] += (target - currentAxes[i]) * Math.min(1.0, delta * 15.0);
            }
            curAlign += Math.abs(currentAxes[i]);
        }

        setAlignment(curAlign);
        uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

        if (audioEngine) {
            audioEngine.updateOzFractal(currentAxes[2] || 0); // Modulate with an axis
        }
    });

    const completion = Math.min(100, Math.max(0, (alignment / 12.0) * 100));

    return (
        <group>
            <mesh ref={meshRef}>
                <planeGeometry args={[2, 2]} />
                <shaderMaterial
                    vertexShader={vertexShader}
                    fragmentShader={fragmentShader}
                    uniforms={uniforms}
                    depthWrite={false}
                    depthTest={false}
                />
            </mesh>
            <Text position={[0, -0.8, -1]} fontSize={0.05} color="white" anchorX="center" anchorY="bottom">
                Fractal Unfolding: {completion.toFixed(1)}% | Chaos: {(uniforms.uChaos.value * 100).toFixed(1)}%
            </Text>
        </group>
    );
};

export function OzFractalScene(props: ModalityProps) {
    return (
        <div className="w-full h-full absolute inset-0 z-0">
            <Canvas camera={{ position: [0, 0, 1] }} orthographic gl={{ preserveDrawingBuffer: true }}>
                <FractalSDF {...props} />
            </Canvas>
        </div>
    );
}

