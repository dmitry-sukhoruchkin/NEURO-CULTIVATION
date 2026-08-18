import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, Text } from '@react-three/drei';
import { BleService } from '../lib/BleService';
import { InputService } from '../lib/InputService';

const VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAGMENT_SHADER = `
uniform vec2 uElectrodes[32];
uniform float uPhases[32];
uniform float uAmplitudes[32];
uniform int uNumElectrodes;
uniform float uTime;
uniform vec2 uVortexCenter;
uniform float uVortexRadius;
uniform float uChirality;
uniform float uSourceSink;

varying vec2 vUv;
varying vec3 vWorldPos;

#define PI 3.14159265359

// HSL to RGB conversion
vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}

void main() {
    vec2 pos = vWorldPos.xy;
    
    vec2 sumVec = vec2(0.0);
    float sumWeight = 0.0;
    float sumAmp = 0.0;
    
    for(int i = 0; i < 32; i++) {
        if (i >= uNumElectrodes) break;
        
        vec2 elecPos = uElectrodes[i];
        float dist = distance(pos, elecPos);
        
        float w = 1.0 / (dist * dist + 0.1); 
        
        float phase = uPhases[i];
        float amp = uAmplitudes[i];
        
        sumVec += vec2(cos(phase), sin(phase)) * w * amp;
        sumAmp += amp * w;
        sumWeight += w;
    }
    
    vec2 avgVec = sumVec / sumWeight;
    float avgAmp = sumAmp / sumWeight;
    
    float finalPhase = atan(avgVec.y, avgVec.x);
    float phaseNorm = (finalPhase + PI) / (2.0 * PI);
    
    float magnitude = length(avgVec) / (avgAmp + 0.001); 
    
    // Base color from phase field
    vec3 color = hsl2rgb(vec3(phaseNorm, 1.0, magnitude * 0.4));
    
    // Data-driven Phase traveling wave contour lines (ripples)
    float contourPhase = phaseNorm * 10.0 - uTime * 3.0;
    float contour = fract(contourPhase);
    float contourLine = smoothstep(0.85, 1.0, contour) + smoothstep(0.15, 0.0, contour);
    color += vec3(1.0) * contourLine * 0.5 * magnitude;
    
    // Highlight phase singularities (where phase is undefined, magnitude approaches 0)
    float singularity = smoothstep(0.15, 0.0, magnitude);
    color += vec3(1.0, 0.0, 0.0) * singularity;
    
    // Draw electrodes
    float elecDist = 999.0;
    for(int i = 0; i < 32; i++) {
        if (i >= uNumElectrodes) break;
        elecDist = min(elecDist, distance(pos, uElectrodes[i]));
    }
    
    if (elecDist < 0.3) {
        color = vec3(1.0);
    }
    
    gl_FragColor = vec4(color, 0.9);
}
`;

function getPhaseAt(px: number, py: number, vectors: {x:number,y:number,px:number,py:number,amp:number}[]) {
    let sumX = 0, sumY = 0, sumWeight = 0;
    for (let i=0; i<vectors.length; i++) {
        const v = vectors[i];
        const dx = px - v.x;
        const dy = py - v.y;
        const distSq = dx*dx + dy*dy;
        const w = 1.0 / (distSq + 0.1); 
        sumX += v.px * w * v.amp;
        sumY += v.py * w * v.amp;
        sumWeight += w;
    }
    return Math.atan2(sumY, sumX);
}

function phaseDiff(p1: number, p2: number) {
    let diff = p1 - p2;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
}

interface PhaseVortexSceneProps {
    showLines?: boolean;
    showGamepad?: boolean;
    showProtoGamepads?: boolean;
    moveSensitivity?: boolean | number;
    audioEngine?: any;
}

export default function PhaseVortexScene({ showLines = false, showGamepad = true, showProtoGamepads = false, moveSensitivity = 0.05, audioEngine = null }: PhaseVortexSceneProps) {
    const { camera } = useThree();
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const gamepadLinesRef = useRef<THREE.LineSegments>(null);
    const gamepadArrowRef = useRef<THREE.Group>(null);
    const localGamepadsRef = useRef<THREE.Group>(null);
    const cursorRef = useRef<THREE.Mesh>(null);
    
    useEffect(() => {
        return () => {
            if (audioEngine) audioEngine.cleanupPhaseVortexAudio();
        };
    }, [audioEngine]);

    const [gamepadState, setGamepadState] = useState({ vx: 0, vy: 0, tq: 0 });
    const smoothedStateRef = useRef({ vx: 0, vy: 0, tq: 0 });
    const smoothedPairsRef = useRef(new Float32Array(3000)); // Max lines ~ 120 * 3 = 360, so 3000 is plenty
    const linesRef = useRef<THREE.LineSegments>(null);
    const arrowsRef = useRef<THREE.InstancedMesh>(null);
    
    const GRID_RES = 16;
    const GRID_SIZE = 24;
    const NUM_ARROWS = GRID_RES * GRID_RES;
    
    const [vortexCenter, setVortexCenter] = useState({x: 0, y: 0});
    const [vortexRadius, setVortexRadius] = useState(0);
    const [chirality, setChirality] = useState(0);
    const [sourceSink, setSourceSink] = useState(0);
    
    const [stats, setStats] = useState({ cw: 0, ccw: 0, sources: 0, sinks: 0 });

    const shaderArgs = useMemo(() => {
        return {
            uniforms: {
                uElectrodes: { value: new Array(32).fill(new THREE.Vector2()) },
                uPhases: { value: new Array(32).fill(0) },
                uAmplitudes: { value: new Array(32).fill(0) },
                uNumElectrodes: { value: 0 },
                uTime: { value: 0 },
                uVortexCenter: { value: new THREE.Vector2(0, 0) },
                uVortexRadius: { value: 2.0 },
                uChirality: { value: 1.0 },
                uSourceSink: { value: 0.0 }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            transparent: true
        };
    }, []);
    
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state) => {
        camera.position.set(0, 0, 25);
        camera.lookAt(0, 0, 0);
        
        const ble = BleService.getInstance();
        const input = InputService.getInstance();
        
        const electrodes = ble.electrodes;
        const numChannels = ble.numChannels;
        
        if (materialRef.current) {
            materialRef.current.uniforms.uNumElectrodes.value = numChannels + 2;
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            materialRef.current.uniforms.uVortexCenter.value.set(vortexCenter.x, vortexCenter.y);
            materialRef.current.uniforms.uVortexRadius.value = vortexRadius;
            materialRef.current.uniforms.uChirality.value = chirality;
            materialRef.current.uniforms.uSourceSink.value = sourceSink;
            
            // Frequencies to use for phase (e.g., alpha band 8-12 Hz for strong cortical traveling waves)
            const startFreq = 8;
            const endFreq = 12;
            
            let phaseVectors: {x: number, y: number, phase: number, px: number, py: number, amp: number}[] = [];

            for (let i = 0; i < numChannels; i++) {
                materialRef.current.uniforms.uElectrodes.value[i] = new THREE.Vector2(electrodes[i].x, electrodes[i].y);
                
                let sumRe = 0;
                let sumIm = 0;
                let sumAmp = 0;
                
                for (let f = startFreq; f <= endFreq; f++) {
                    const re = ble.reArr[i]?.[f] || 0;
                    const im = ble.imArr[i]?.[f] || 0;
                    sumRe += re;
                    sumIm += im;
                    sumAmp += Math.sqrt(re*re + im*im);
                }
                
                const phase = Math.atan2(sumIm, sumRe);
                const amp = sumAmp / (endFreq - startFreq + 1);
                
                materialRef.current.uniforms.uPhases.value[i] = phase;
                materialRef.current.uniforms.uAmplitudes.value[i] = amp;
                
                phaseVectors.push({
                    x: electrodes[i].x,
                    y: electrodes[i].y,
                    phase: phase,
                    px: Math.cos(phase),
                    py: Math.sin(phase),
                    amp: amp
                });
            }

            // Add Reference Electrode
            const refEl = ble.referenceElectrode;
            materialRef.current.uniforms.uElectrodes.value[numChannels] = new THREE.Vector2(refEl.x, refEl.y);
            materialRef.current.uniforms.uPhases.value[numChannels] = 0; // Phase 0
            materialRef.current.uniforms.uAmplitudes.value[numChannels] = 0; // Amplitude 0
            
            // Add Ground Electrode
            const gndEl = ble.groundElectrode;
            materialRef.current.uniforms.uElectrodes.value[numChannels + 1] = new THREE.Vector2(gndEl.x, gndEl.y);
            materialRef.current.uniforms.uPhases.value[numChannels + 1] = 0; // Phase 0
            materialRef.current.uniforms.uAmplitudes.value[numChannels + 1] = 0; // Amplitude 0
            
            // Try to find the vortex center (where phase vectors cancel out / amplitude is low, or phase circulation is high)
            let dipoleX = 0;
            let dipoleY = 0;
            
            for (let i = 0; i < numChannels; i++) {
                 dipoleX += phaseVectors[i].px * phaseVectors[i].x;
                 dipoleY += phaseVectors[i].py * phaseVectors[i].y;
            }
            
            dipoleX /= numChannels;
            dipoleY /= numChannels;
            
            // Update vortex state
            setVortexCenter({ x: dipoleX, y: dipoleY });
            
            // Calculate Chirality (Rotation) and Source/Sink around the new center
            // We will compute this from the vector field directly
            let radialSum = 0;
            let azimuthalSum = 0;
            
            let cwCount = 0;
            let ccwCount = 0;
            let sourceCount = 0;
            let sinkCount = 0;
            
            const localVortices: {x: number, y: number, tq: number, shiftX: number, shiftY: number}[] = [];
            
            // Phase Gradient Vector Field (Arrows)
            if (arrowsRef.current) {
                let idx = 0;
                const d = 0.5; // step for gradient calculation
                const baseScale = 0.8;
                let activePoints = 0;
                
                // Precalculate grid phases for singularity detection
                const gridPhases: number[][] = [];
                for (let y = 0; y < GRID_RES; y++) {
                    gridPhases[y] = [];
                    for (let x = 0; x < GRID_RES; x++) {
                        const px = (x / (GRID_RES - 1)) * GRID_SIZE - GRID_SIZE / 2;
                        const py = (y / (GRID_RES - 1)) * GRID_SIZE - GRID_SIZE / 2;
                        gridPhases[y][x] = getPhaseAt(px, py, phaseVectors);
                    }
                }
                
                for (let y = 0; y < GRID_RES; y++) {
                    for (let x = 0; x < GRID_RES; x++) {
                        const px = (x / (GRID_RES - 1)) * GRID_SIZE - GRID_SIZE / 2;
                        const py = (y / (GRID_RES - 1)) * GRID_SIZE - GRID_SIZE / 2;
                        
                        // Limit to brain map area
                        if (px*px + py*py > 15*15) {
                            dummy.scale.set(0,0,0);
                            dummy.updateMatrix();
                            arrowsRef.current.setMatrixAt(idx++, dummy.matrix);
                            continue;
                        }
                        
                        // Singularity Detection (Topological Defects)
                        if (x < GRID_RES - 1 && y < GRID_RES - 1) {
                            const p00 = gridPhases[y][x];
                            const p10 = gridPhases[y][x+1];
                            const p11 = gridPhases[y+1][x+1];
                            const p01 = gridPhases[y+1][x];
                            
                            const dp1 = phaseDiff(p10, p00);
                            const dp2 = phaseDiff(p11, p10);
                            const dp3 = phaseDiff(p01, p11);
                            const dp4 = phaseDiff(p00, p01);
                            
                            const circulation = dp1 + dp2 + dp3 + dp4;
                            
                            const gradX_0 = phaseDiff(p10, p00);
                            const gradX_1 = phaseDiff(p11, p01);
                            const gradY_0 = phaseDiff(p01, p00);
                            const gradY_1 = phaseDiff(p11, p10);
                            
                            if (circulation > 3.0 || circulation < -3.0) {
                                const isCCW = circulation > 3.0;
                                if (isCCW) ccwCount++; else cwCount++;
                                
                                const dx_grid = GRID_SIZE / (GRID_RES - 1);
                                const avgGradX = (gradX_0 + gradX_1) / (2.0 * dx_grid);
                                const avgGradY = (gradY_0 + gradY_1) / (2.0 * dx_grid);
                                
                                localVortices.push({
                                    x: px + dx_grid / 2,
                                    y: py + dx_grid / 2,
                                    tq: isCCW ? 1 : -1,
                                    shiftX: avgGradX,
                                    shiftY: avgGradY
                                });
                            }
                            
                            const div = (gradX_1 - gradX_0) + (gradY_1 - gradY_0);
                            
                            if (div > 1.0) sourceCount++;
                            else if (div < -1.0) sinkCount++;
                        }
                        
                        const p0 = gridPhases[y][x];
                        const px1 = x < GRID_RES - 1 ? gridPhases[y][x+1] : getPhaseAt(px + d, py, phaseVectors);
                        const py1 = y < GRID_RES - 1 ? gridPhases[y+1][x] : getPhaseAt(px, py + d, phaseVectors);
                        
                        // Compute spatial gradient of phase
                        const gradX = phaseDiff(px1, p0) / (GRID_SIZE / (GRID_RES - 1));
                        const gradY = phaseDiff(py1, p0) / (GRID_SIZE / (GRID_RES - 1));
                        
                        // Accumulate radial and azimuthal flow relative to dipole
                        const dx = px - dipoleX;
                        const dy = py - dipoleY;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist > 0.1) {
                            const rx = dx / dist;
                            const ry = dy / dist;
                            const ax = -ry;
                            const ay = rx;
                            radialSum += gradX * rx + gradY * ry;
                            azimuthalSum += gradX * ax + gradY * ay;
                            activePoints++;
                        }
                        
                        // Direction of traveling wave
                        const angle = Math.atan2(gradY, gradX);
                        // Magnitude of spatial gradient (wave number)
                        const mag = Math.sqrt(gradX*gradX + gradY*gradY);
                        
                        dummy.position.set(px, py, 0.2);
                        // Math.atan2 returns angle from X axis. Cone points along Y axis. So we subtract PI/2.
                        dummy.rotation.z = angle - Math.PI / 2;
                        
                        // Scale based on gradient magnitude (steeper gradient = larger arrow / faster change)
                        const scale = Math.min(1.5, Math.max(0.2, mag * 1.5));
                        dummy.scale.set(baseScale * scale, baseScale * scale, baseScale * scale);
                        dummy.updateMatrix();
                        
                        arrowsRef.current.setMatrixAt(idx++, dummy.matrix);
                    }
                }
                arrowsRef.current.instanceMatrix.needsUpdate = true;
                
                // Smoothing the analytics
                if (activePoints > 0) {
                    setChirality(prev => prev + ((azimuthalSum / activePoints) - prev) * 0.1);
                    setSourceSink(prev => prev + ((radialSum / activePoints) - prev) * 0.1);
                }
                
                setStats({ cw: cwCount, ccw: ccwCount, sources: sourceCount, sinks: sinkCount });
                
                if (localGamepadsRef.current) {
                    const maxVortices = localGamepadsRef.current.children.length;
                    for (let i = 0; i < maxVortices; i++) {
                        const localGroup = localGamepadsRef.current.children[i] as THREE.Group;
                        if (i < localVortices.length && showProtoGamepads) {
                            localGroup.visible = true;
                            const v = localVortices[i];
                            localGroup.position.set(v.x, v.y, 0);
                            
                            // Ring rotation visualization
                            const isCCW = v.tq > 0;
                            // color local rings based on CW / CCW
                            const ringColor = isCCW ? new THREE.Color("#00FF00") : new THREE.Color("#FF00FF");
                            const ringMesh = localGroup.getObjectByName("ring") as THREE.Mesh;
                            if (ringMesh) {
                                (ringMesh.material as THREE.MeshBasicMaterial).color = ringColor;
                            }
                            
                            // Make the ring spin
                            const visualSensitivity = typeof moveSensitivity === 'number' ? moveSensitivity * 20.0 : 1.0;
                            localGroup.rotation.z += (isCCW ? 0.05 : -0.05) * visualSensitivity;
                            
                            for (let j = 0; j < 4; j++) {
                                const arrow = localGroup.getObjectByName(`ringArrow${j}`) as THREE.Mesh;
                                if (arrow) {
                                    (arrow.material as THREE.MeshBasicMaterial).color = ringColor;
                                    const baseAngle = j * Math.PI / 2;
                                    arrow.rotation.z = isCCW ? baseAngle : baseAngle + Math.PI;
                                }
                            }
                            
                                // Local shift arrow
                            const shiftGroup = localGroup.getObjectByName("shiftArrow") as THREE.Group;
                            if (shiftGroup) {
                                const shiftMag = Math.sqrt(v.shiftX * v.shiftX + v.shiftY * v.shiftY);
                                if (shiftMag > 0.01) {
                                    shiftGroup.visible = true;
                                    const angle = Math.atan2(v.shiftY, v.shiftX);
                                    // undo the spinning of localGroup so the arrow points in the absolute correct direction
                                    shiftGroup.rotation.z = angle - Math.PI / 2 - localGroup.rotation.z;
                                    const visualSensitivity = typeof moveSensitivity === 'number' ? moveSensitivity * 20.0 : 1.0;
                                    const scale = Math.min(5.0, shiftMag * 2.0 * visualSensitivity);
                                    shiftGroup.scale.set(1, scale, 1);
                                } else {
                                    shiftGroup.visible = false;
                                }
                            }
                            
                        } else {
                            localGroup.visible = false;
                        }
                    }
                }
            }

            // Radius could be related to coherence or amplitude
            let avgAmp = phaseVectors.reduce((sum, v) => sum + v.amp, 0) / numChannels;
            setVortexRadius(avgAmp * 5.0);

            // Coherence Network (Phase Synchrony)
            if (linesRef.current) {
                const maxLines = (numChannels * (numChannels - 1)) / 2;
                
                if (showLines) {
                    // Initialize geometry buffers if needed
                    if (!linesRef.current.geometry.hasAttribute('position') || 
                        linesRef.current.geometry.attributes.position.count < maxLines * 2) {
                        const posArray = new Float32Array(maxLines * 6);
                        const colArray = new Float32Array(maxLines * 6);
                        linesRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
                        linesRef.current.geometry.setAttribute('color', new THREE.BufferAttribute(colArray, 3));
                    }
                    
                    const posAttr = linesRef.current.geometry.attributes.position as THREE.BufferAttribute;
                    const colAttr = linesRef.current.geometry.attributes.color as THREE.BufferAttribute;
                    
                    let lineIdx = 0;
                    
                    for (let i = 0; i < numChannels; i++) {
                        for (let j = i + 1; j < numChannels; j++) {
                            const phaseDiff = phaseVectors[i].phase - phaseVectors[j].phase;
                            const coherence = Math.max(0, 1.0 - Math.abs(Math.sin(phaseDiff / 2.0))); // Synchrony
                            const strength = (phaseVectors[i].amp + phaseVectors[j].amp) * 0.5 * coherence;
                            
                            // Only draw strong connections
                            if (strength > 0.4) {
                                const pOffset = lineIdx * 6;
                                
                                posAttr.array[pOffset] = phaseVectors[i].x;
                                posAttr.array[pOffset+1] = phaseVectors[i].y;
                                posAttr.array[pOffset+2] = 0.1;
                                
                                posAttr.array[pOffset+3] = phaseVectors[j].x;
                                posAttr.array[pOffset+4] = phaseVectors[j].y;
                                posAttr.array[pOffset+5] = 0.1;
                                
                                // Color by lead/lag relationship
                                const lead = phaseDiff > 0;
                                const r = lead ? 1.0 : 0.0;
                                const g = lead ? 0.0 : 1.0;
                                const b = 1.0;
                                
                                colAttr.array[pOffset] = r;
                                colAttr.array[pOffset+1] = g;
                                colAttr.array[pOffset+2] = b;
                                
                                colAttr.array[pOffset+3] = r;
                                colAttr.array[pOffset+4] = g;
                                colAttr.array[pOffset+5] = b;
                                
                                lineIdx++;
                            }
                        }
                    }
                    
                    linesRef.current.geometry.setDrawRange(0, lineIdx * 2);
                    posAttr.needsUpdate = true;
                    colAttr.needsUpdate = true;
                } else {
                    linesRef.current.geometry.setDrawRange(0, 0);
                }
            }
            
            // Gamepad Hypothesis (ArcAgiScene mapping representation)
            if (gamepadLinesRef.current && gamepadArrowRef.current) {
                const maxLines = (numChannels * (numChannels - 1)) / 2;
                if (!gamepadLinesRef.current.geometry.hasAttribute('position') || 
                    gamepadLinesRef.current.geometry.attributes.position.count < maxLines * 4) {
                    const posArray = new Float32Array(maxLines * 12);
                    const colArray = new Float32Array(maxLines * 12);
                    gamepadLinesRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
                    gamepadLinesRef.current.geometry.setAttribute('color', new THREE.BufferAttribute(colArray, 3));
                }
                
                const posAttr = gamepadLinesRef.current.geometry.attributes.position as THREE.BufferAttribute;
                const colAttr = gamepadLinesRef.current.geometry.attributes.color as THREE.BufferAttribute;
                
                let lineIdx = 0;
                let gx = 0;
                let gy = 0;
                let gtq = 0;
                
                // --- SMOOTHING LOGIC IDENTICAL TO BRAIN MAZE ---
                const skillLevel = typeof moveSensitivity === 'number' ? moveSensitivity : 0.05;
                const smooth = 0.98 - (skillLevel * 0.1);
                const intentGain = 1.5; // EngineConfig.Maze.intentGain
                const gain = skillLevel * intentGain;
                
                let pairIdx = 0;
                for (let i = 0; i < numChannels; i++) {
                    for (let j = i + 1; j < numChannels; j++) {
                        const ciPLV = ble.rawAxes ? ble.rawAxes[pairIdx] : 0;
                        
                        const dx = phaseVectors[j].x - phaseVectors[i].x;
                        const dy = phaseVectors[j].y - phaseVectors[i].y;
                        
                        const intentX = ciPLV * dx;
                        const intentY = ciPLV * dy;
                        const intentTq = (ciPLV * (phaseVectors[i].x * dy - phaseVectors[i].y * dx)) / 100.0;
                        
                        gx += intentX;
                        gy += intentY;
                        gtq += intentTq;
                        
                        // Smooth local components identically
                        const sIdx = pairIdx * 3;
                        smoothedPairsRef.current[sIdx] = smoothedPairsRef.current[sIdx] * smooth + intentX * gain * (1 - smooth);
                        smoothedPairsRef.current[sIdx+1] = smoothedPairsRef.current[sIdx+1] * smooth + intentY * gain * (1 - smooth);
                        smoothedPairsRef.current[sIdx+2] = smoothedPairsRef.current[sIdx+2] * smooth + intentTq * gain * 0.5 * (1 - smooth);
                        
                        const valX = smoothedPairsRef.current[sIdx];
                        const valY = smoothedPairsRef.current[sIdx+1];
                        const valTq = smoothedPairsRef.current[sIdx+2];
                        
                        // Display lines if the smoothed magnitude is visible
                        if (Math.abs(valX) > 0.001 || Math.abs(valY) > 0.001 || Math.abs(valTq) > 0.001) {
                            const pOffset = lineIdx * 12;
                            
                            // Center of the dipole connection
                            const cx = (phaseVectors[i].x + phaseVectors[j].x) * 0.5;
                            const cy = (phaseVectors[i].y + phaseVectors[j].y) * 0.5;
                            
                            // Visual sensitivity scaling
                            const visualSensitivity = 20.0; // moveSensitivity is already baked into valX/valY via gain
                            
                            // 1. Shift Vector (Linear)
                            const shiftScale = visualSensitivity * 10.0; 
                            
                            posAttr.array[pOffset] = cx;
                            posAttr.array[pOffset+1] = cy;
                            posAttr.array[pOffset+2] = 0.2;
                            
                            posAttr.array[pOffset+3] = cx + valX * shiftScale;
                            posAttr.array[pOffset+4] = cy + valY * shiftScale;
                            posAttr.array[pOffset+5] = 0.2;
                            
                            colAttr.array[pOffset] = 1.0; colAttr.array[pOffset+1] = 1.0; colAttr.array[pOffset+2] = 0.0; // Yellow for shift
                            colAttr.array[pOffset+3] = 1.0; colAttr.array[pOffset+4] = 1.0; colAttr.array[pOffset+5] = 0.0;
                            
                            // 2. Rotation Vector (Tangential)
                            const r_dist = Math.max(0.1, Math.sqrt(cx * cx + cy * cy));
                            const tanX = -cy / r_dist;
                            const tanY = cx / r_dist;
                            
                            const tqScale = valTq * 300.0 * visualSensitivity;
                            
                            posAttr.array[pOffset+6] = cx;
                            posAttr.array[pOffset+7] = cy;
                            posAttr.array[pOffset+8] = 0.2;
                            
                            posAttr.array[pOffset+9] = cx + tanX * tqScale;
                            posAttr.array[pOffset+10] = cy + tanY * tqScale;
                            posAttr.array[pOffset+11] = 0.2;
                            
                            // Color by rotation direction (CW vs CCW)
                            const isCCW = valTq > 0;
                            const r = isCCW ? 0.0 : 1.0; // Magenta for CW
                            const g = isCCW ? 1.0 : 0.0; // Green for CCW
                            const b = isCCW ? 0.0 : 1.0; 
                            
                            colAttr.array[pOffset+6] = r; colAttr.array[pOffset+7] = g; colAttr.array[pOffset+8] = b;
                            colAttr.array[pOffset+9] = r; colAttr.array[pOffset+10] = g; colAttr.array[pOffset+11] = b;
                            
                            lineIdx++;
                        }
                        
                        pairIdx++;
                    }
                }
                
                const scale = 28.0 / Math.max(1, maxLines);
                gx *= scale;
                gy *= scale;
                gtq *= scale;
                
                smoothedStateRef.current.vx = smoothedStateRef.current.vx * smooth + gx * gain * (1 - smooth);
                smoothedStateRef.current.vy = smoothedStateRef.current.vy * smooth + gy * gain * (1 - smooth);
                // torque has a * 0.5 factor applied in BrainMazeScene smoothing logic
                smoothedStateRef.current.tq = smoothedStateRef.current.tq * smooth + gtq * gain * 0.5 * (1 - smooth);
                
                const sgx = smoothedStateRef.current.vx;
                const sgy = smoothedStateRef.current.vy;
                const sgtq = smoothedStateRef.current.tq;
                
                if (showProtoGamepads) {
                    gamepadLinesRef.current.geometry.setDrawRange(0, lineIdx * 4);
                } else {
                    gamepadLinesRef.current.geometry.setDrawRange(0, 0);
                }
                posAttr.needsUpdate = true;
                colAttr.needsUpdate = true;
                
                // Update the global Rotation Ring and Shift Arrow
                const absTq = Math.abs(sgtq);
                const shiftMag = Math.sqrt(sgx * sgx + sgy * sgy);
                const visualSensitivity = typeof moveSensitivity === 'number' ? moveSensitivity * 20.0 : 1.0;
                
                if (showGamepad && (absTq > 0.01 || shiftMag > 0.01)) {
                    gamepadArrowRef.current.visible = true;
                    
                    const ringGroup = gamepadArrowRef.current.getObjectByName("globalRingGroup") as THREE.Group;
                    if (ringGroup) {
                        // Scale the entire ring based on torque magnitude (increased for better visibility at default sensitivity)
                        const scaleRing = Math.max(0.5, Math.min(6.0, absTq * 30.0 * visualSensitivity));
                        ringGroup.scale.set(scaleRing, scaleRing, scaleRing);
                        
                        // Flip the arrows depending on rotation direction
                        const isCCW = sgtq > 0;
                        ringGroup.rotation.z += (isCCW ? 0.02 : -0.02) * visualSensitivity;
                        
                        for (let i = 1; i <= 4; i++) {
                            const arrow = ringGroup.children[i] as THREE.Mesh;
                            if (arrow) {
                                const angle = (i - 1) * Math.PI / 2;
                                // Tangent direction
                                const tangentAngle = isCCW ? angle + Math.PI / 2 : angle - Math.PI / 2;
                                arrow.rotation.z = tangentAngle - Math.PI / 2; // cone points up by default
                            }
                        }
                    }
                    
                    const shiftGroup = gamepadArrowRef.current.getObjectByName("globalShiftArrow") as THREE.Group;
                    if (shiftGroup) {
                        if (shiftMag > 0.01) {
                            shiftGroup.visible = true;
                            const shiftAngle = Math.atan2(sgy, sgx);
                            shiftGroup.rotation.z = shiftAngle - Math.PI / 2;
                            
                            const scaleShift = Math.max(0.5, Math.min(6.0, shiftMag * 10.0 * visualSensitivity));
                            shiftGroup.scale.set(1, scaleShift, 1);
                        } else {
                            shiftGroup.visible = false;
                        }
                    }
                    
                    if (Math.random() < 0.1) setGamepadState({ vx: sgx, vy: sgy, tq: sgtq });
                } else {
                    gamepadArrowRef.current.visible = false;
                    if (Math.random() < 0.1) setGamepadState({ vx: sgx, vy: sgy, tq: sgtq });
                }
                
                if (audioEngine) {
                    audioEngine.updatePhaseVortexAudio(localVortices, sgtq, sgx, sgy);
                }
            }
            
            // Move cursor to dipole
            if (cursorRef.current) {
                // If using gamepad, we can mix it or just show it
                const axes = input.getMultiDeviceAxes();
                // We'll let the vortex BE the cursor if no gamepad, otherwise gamepad
                const useGamepadForCursor = input.useGamepad && (Math.abs(axes[0]) > 0.1 || Math.abs(axes[1]) > 0.1);
                
                if (useGamepadForCursor) {
                    cursorRef.current.position.x = axes[0] * 10;
                    cursorRef.current.position.y = -axes[1] * 10;
                } else {
                    cursorRef.current.position.x += (dipoleX * 2.0 - cursorRef.current.position.x) * 0.1;
                    cursorRef.current.position.y += (dipoleY * 2.0 - cursorRef.current.position.y) * 0.1;
                }
            }
        }
    });

    const isCW = chirality < 0;
    const isSource = sourceSink > 0;
    const isFrontal = vortexCenter.y > 0;

    return (
        <group>
            <mesh position={[0, 0, -1]}>
                <planeGeometry args={[30, 30]} />
                <shaderMaterial ref={materialRef} args={[shaderArgs]} />
            </mesh>
            
            <lineSegments ref={linesRef}>
                <bufferGeometry />
                <lineBasicMaterial vertexColors transparent opacity={0.9} />
            </lineSegments>
            
            <instancedMesh ref={arrowsRef} args={[undefined as any, undefined as any, NUM_ARROWS]}>
                <coneGeometry args={[0.2, 0.8, 8]} />
                <meshBasicMaterial color="#FFFFFF" transparent opacity={0.6} depthTest={false} />
            </instancedMesh>
            
            <lineSegments ref={gamepadLinesRef}>
                <bufferGeometry />
                <lineBasicMaterial vertexColors transparent opacity={0.18} depthTest={false} />
            </lineSegments>
            
            <group ref={gamepadArrowRef} position={[0, 0, 0.2]}>
                <group name="globalRingGroup">
                    <mesh position={[0, 0, 0]}>
                        <ringGeometry args={[2.0, 2.2, 32]} />
                        <meshBasicMaterial color="#FFB600" transparent opacity={0.6} depthTest={false} />
                    </mesh>
                    {/* 4 arrows on the ring to show direction */}
                    {[0, 1, 2, 3].map(i => (
                        <mesh key={i} position={[2.1 * Math.cos(i * Math.PI/2), 2.1 * Math.sin(i * Math.PI/2), 0]} rotation={[0, 0, i * Math.PI/2]}>
                            <coneGeometry args={[0.3, 0.6, 8]} />
                            <meshBasicMaterial color="#FFB600" transparent opacity={0.9} depthTest={false} />
                        </mesh>
                    ))}
                </group>
                <group name="globalShiftArrow">
                    <mesh position={[0, 1.0, 0]}>
                        <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
                        <meshBasicMaterial color="#FFFF00" transparent opacity={0.9} depthTest={false} />
                    </mesh>
                    <mesh position={[0, 2.0, 0]}>
                        <coneGeometry args={[0.4, 0.8, 8]} />
                        <meshBasicMaterial color="#FFFF00" transparent opacity={0.9} depthTest={false} />
                    </mesh>
                </group>
            </group>
            
            <group ref={localGamepadsRef} position={[0, 0, 0.2]}>
                {Array.from({ length: 16 }).map((_, i) => (
                    <group key={i} visible={false}>
                        <mesh name="ring">
                            <ringGeometry args={[0.8, 1.0, 16]} />
                            <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} depthTest={false} />
                        </mesh>
                        {[0, 1, 2, 3].map(j => (
                            <mesh key={j} name={`ringArrow${j}`} position={[0.9 * Math.cos(j * Math.PI/2), 0.9 * Math.sin(j * Math.PI/2), 0]} rotation={[0, 0, j * Math.PI/2]}>
                                <coneGeometry args={[0.2, 0.4, 8]} />
                                <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} depthTest={false} />
                            </mesh>
                        ))}
                        <group name="shiftArrow">
                            <mesh position={[0, 0.5, 0]}>
                                <cylinderGeometry args={[0.08, 0.08, 1, 8]} />
                                <meshBasicMaterial color="#00FFFF" transparent opacity={0.9} depthTest={false} />
                            </mesh>
                            <mesh position={[0, 1.0, 0]}>
                                <coneGeometry args={[0.2, 0.4, 8]} />
                                <meshBasicMaterial color="#00FFFF" transparent opacity={0.9} depthTest={false} />
                            </mesh>
                        </group>
                    </group>
                ))}
            </group>
            
            <mesh ref={cursorRef} position={[0, 0, 0]}>
                <ringGeometry args={[0.8, 1.0, 32]} />
                <meshBasicMaterial color="#00FF00" transparent opacity={0.8} />
            </mesh>
            
            {/* Reference & Ground visualization */}
            <mesh position={[BleService.getInstance().referenceElectrode.x, BleService.getInstance().referenceElectrode.y, 0]}>
                <circleGeometry args={[0.4, 16]} />
                <meshBasicMaterial color="#00FFFF" wireframe />
            </mesh>
            <mesh position={[BleService.getInstance().groundElectrode.x, BleService.getInstance().groundElectrode.y, 0]}>
                <circleGeometry args={[0.4, 16]} />
                <meshBasicMaterial color="#FF00FF" wireframe />
            </mesh>
            
            <Html position={[0, 0, 0]} style={{ pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: '-45vh', left: '-45vw', width: '90vw', color: 'white', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
                    
                    {/* Left Panel: Analytics Raw */}
                    <div style={{ maxWidth: '400px' }}>
                        <h2 style={{ color: '#00FFFF', fontSize: '24px', marginBottom: '10px' }}>PHASE VORTEX ANALYTICS</h2>
                        <div style={{ padding: '10px', background: 'rgba(0,255,255,0.1)', border: '1px solid #00FFFF', borderRadius: '4px' }}>
                            <div style={{ marginBottom: '8px' }}>
                                <span style={{ color: '#888' }}>Vortex Center (Dipole):</span><br/>
                                X: {vortexCenter.x.toFixed(2)} | Y: {vortexCenter.y.toFixed(2)}
                            </div>
                            <div style={{ marginBottom: '8px' }}>
                                <span style={{ color: '#888' }}>Vortex Radius (Amplitude):</span><br/>
                                {vortexRadius.toFixed(2)}
                            </div>
                            <div style={{ marginBottom: '8px' }}>
                                <span style={{ color: '#888' }}>Chirality (Rotation):</span><br/>
                                <span style={{ color: isCW ? '#FF00FF' : '#00FF00' }}>
                                    {chirality.toFixed(3)} [{isCW ? 'Clockwise (CW)' : 'Counter-Clockwise (CCW)'}]
                                </span>
                            </div>
                            <div>
                                <span style={{ color: '#888' }}>Flow (Source/Sink):</span><br/>
                                <span style={{ color: isSource ? '#FFFF00' : '#00AFFF' }}>
                                    {sourceSink.toFixed(3)} [{isSource ? 'Expanding Source' : 'Converging Sink'}]
                                </span>
                            </div>
                        </div>
                        <div style={{ marginTop: 20, padding: '10px', background: 'rgba(255,255,0,0.1)', border: '1px solid #FFFF00', borderRadius: '4px' }}>
                            <h3 style={{ color: '#FFFF00', margin: '0 0 10px 0', fontSize: '16px' }}>TOPOLOGICAL DEFECTS (CHAOS)</h3>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span>Vortices (CCW): <span style={{ color: '#00FF00' }}>{stats.ccw}</span></span>
                                <span>Anti-Vortices (CW): <span style={{ color: '#FF00FF' }}>{stats.cw}</span></span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Sources (Ignition): <span style={{ color: '#FFFF00' }}>{stats.sources}</span></span>
                                <span>Sinks (Integration): <span style={{ color: '#00AFFF' }}>{stats.sinks}</span></span>
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '11px', color: '#AAA' }}>
                                High singularity count = Metastable/Chaotic state (resetting, exploration).<br/>
                                Low count = Synchronized, organized state (homeostasis or focused task).
                            </div>
                        </div>
                        
                        <div style={{ marginTop: 20, fontSize: '12px', color: '#888' }}>
                            <div style={{ color: '#00FF00' }}>Green Ring: Dipole Cursor</div>
                            <div style={{ color: '#FF0000' }}>Red Zones: Phase Singularities</div>
                            <div style={{ color: '#00FFFF' }}>Cyan Circle: Reference Node</div>
                            <div style={{ color: '#FF00FF' }}>Magenta Circle: Ground Node</div>
                        </div>
                    </div>

                    {/* Right Panel: Hypotheses */}
                    {showGamepad && (
                        <div style={{ width: '400px', textAlign: 'right' }}>
                            <h2 style={{ color: '#FF00FF', fontSize: '24px', marginBottom: '10px' }}>NEURO-HYPOTHESES</h2>
                            <div style={{ padding: '10px', background: 'rgba(255,0,255,0.1)', border: '1px solid #FF00FF', borderRadius: '4px', textAlign: 'left' }}>
                                
                                {/* Regional Hypothesis */}
                                <div style={{ marginBottom: '15px' }}>
                                    <strong style={{ color: '#FFF' }}>1. Spatial Topology (Center Y):</strong><br/>
                                    {isFrontal ? (
                                        <span style={{ color: '#00FFFF' }}>Frontal Focus (Anterior): Indicates executive control, working memory engagement, or motor planning.</span>
                                    ) : (
                                        <span style={{ color: '#00FFFF' }}>Parietal Focus (Posterior Pz): Indicates visuospatial processing, attention allocation, and sensory integration.</span>
                                    )}
                                </div>
    
                                {/* Rotation Hypothesis */}
                                <div style={{ marginBottom: '15px' }}>
                                    <strong style={{ color: '#FFF' }}>2. Chirality (Information Routing):</strong><br/>
                                    {isCW ? (
                                        <span style={{ color: '#FF00FF' }}>Clockwise: Potential top-down predictive control. Brain is sending expectations to lower sensory regions.</span>
                                    ) : (
                                        <span style={{ color: '#00FF00' }}>Counter-Clockwise: Potential bottom-up sensory integration. Brain is routing raw sensory data upward for processing.</span>
                                    )}
                                </div>
    
                                {/* Spatial Scale Information */}
                                <div style={{ marginBottom: '15px' }}>
                                    <strong style={{ color: '#FFF' }}>3. Mesoscopic Traveling Waves:</strong><br/>
                                    <span style={{ color: '#00FFFF' }}>
                                        Grid Size: 26mm diameter. <br/>
                                        Cortical phase vortices and mesoscopic traveling waves span spatial scales of ~1 to 5 cm (10-50mm) and propagate at 0.1-0.6 m/s. <br/>
                                        <strong style={{ color: '#FFB600' }}>Hypothesis:</strong> A 26mm dense array perfectly covers the spatial scale needed to observe these topological defects and traveling wavefronts in real-time.
                                    </span>
                                </div>
    
                                {/* Gamepad Control Hypothesis */}
                                <div style={{ padding: '10px', background: 'rgba(255,182,0,0.1)', border: '1px solid #FFB600', borderRadius: '4px', marginTop: '15px' }}>
                                    <strong style={{ color: '#FFB600' }}>GAMEPAD CONTROL (SHIFT & ROTATION) HYPOTHESIS:</strong><br/>
                                    <span style={{ color: '#FFF', fontSize: '12px' }}>
                                        Deconstructing the physical control extracted in the Maze mode: the movement vectors (VX, VY, TQ) of the entire 26mm grid are calculated by weighting the spatial coordinates against the continuous PLV matrix: <code>ciPLV * (distance or cross product)</code>.
                                    </span>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', alignItems: 'center' }}>
                                        <div style={{ color: '#FFFF00' }}>
                                            Net Shift (X, Y): <br/>
                                            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{gamepadState.vx.toFixed(3)}, {gamepadState.vy.toFixed(3)}</span>
                                        </div>
                                        <div style={{ color: '#FFB600' }}>
                                            Net Torque (TQ): <br/>
                                            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{gamepadState.tq.toFixed(3)}</span>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '10px', fontSize: '11px', color: '#AAA' }}>
                                        <strong style={{ color: '#FFB600' }}>Orange Ring (Scene):</strong> Global angular momentum (TQ).<br/>
                                        <strong style={{ color: '#FFFF00' }}>Yellow Arrow (Scene):</strong> Global shift vector (VX, VY).<br/>
                                        <span style={{ color: '#FFFF00' }}>Yellow lines</span>: Local linear shift contributions (VX/VY).<br/>
                                        <span style={{ color: '#00FF00' }}>Green / </span><span style={{ color: '#FF00FF' }}>Magenta</span> curves: Local rotational contributions (CCW/CW).
                                    </div>
                                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,182,0,0.3)', fontSize: '12px', color: '#FFF' }}>
                                        <strong style={{ color: '#00FFFF' }}>MULTI-VORTEX (LOCAL GAMEPADS) HYPOTHESIS:</strong><br/>
                                        When multiple topological defects (vortices) exist, each one acts as an independent local "gamepad". 
                                        <ul style={{ paddingLeft: '15px', marginTop: '5px', marginBottom: '5px' }}>
                                            <li><span style={{ color: '#00FF00' }}>Green rings</span>: Local Counter-Clockwise (CCW) rotation.</li>
                                            <li><span style={{ color: '#FF00FF' }}>Magenta rings</span>: Local Clockwise (CW) rotation.</li>
                                            <li><span style={{ color: '#00FFFF' }}>Cyan arrows</span>: Local shift (drift direction of the vortex pushed by background traveling waves).</li>
                                        </ul>
                                        <span style={{ color: '#AAA' }}>The global gamepad is simply the macro-level aggregation of all these local micro-gamepad shifts and rotations.</span>
                                    </div>
                                </div>
                                
                                {/* Phase Coherence Hypothesis */}
                                <div style={{ marginBottom: '15px' }}>
                                    <strong style={{ color: '#FFF' }}>4. Coherence Network (Connections):</strong><br/>
                                    <span style={{ color: '#00FFFF' }}>Cyan/Magenta Lines:</span> Represents phase synchronization (PLI). High connectivity indicates synchronized neural firing between areas, forming functional networks for cognitive tasks.
                                </div>
    
                                {/* Flow Hypothesis */}
                                <div>
                                    <strong style={{ color: '#FFF' }}>5. Wave Flow (Ripples):</strong><br/>
                                    {isSource ? (
                                        <span style={{ color: '#FFFF00' }}>Source (Expanding): Cortical ignition. A local region is broadcasting information across the network via traveling waves.</span>
                                    ) : (
                                        <span style={{ color: '#00AFFF' }}>Sink (Converging): Information integration. The network is converging data into this hub for local processing.</span>
                                    )}
                                </div>
    
                            </div>
                        </div>
                    )}

                </div>
            </Html>
        </group>
    );
}

