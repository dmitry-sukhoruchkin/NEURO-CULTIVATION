import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import { globalXrStore as xrStore } from '../lib/xrStore';
import * as THREE from 'three';

const ProjectorPlane = () => {
    const textureRef = useRef<THREE.CanvasTexture | null>(null);
    const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 1;
    
    useFrame(() => {
        if (!textureRef.current || !textureRef.current.image || textureRef.current.image.width === 0) {
            // Find the main app canvas that is actually visible
            const canvases = Array.from(document.querySelectorAll('canvas:not(#vr-canvas)'));
            const visibleCanvas = canvases.find(c => {
                const style = window.getComputedStyle(c);
                return style.display !== 'none' && !c.classList.contains('hidden') && c.clientWidth > 0;
            }) as HTMLCanvasElement;
            
            if (visibleCanvas) {
                textureRef.current = new THREE.CanvasTexture(visibleCanvas);
                textureRef.current.minFilter = THREE.LinearFilter;
                textureRef.current.magFilter = THREE.LinearFilter;
            }
        } else {
            // This forces the texture to copy the canvas contents every frame
            textureRef.current.needsUpdate = true;
        }
    });

    return (
        <group>
          <color attach="background" args={['#000000']} />
          <ambientLight intensity={1} />
          <mesh position={[0, 1.5, -4]}>
              <planeGeometry args={[4 * aspect, 4]} />
              <meshBasicMaterial map={textureRef.current} side={THREE.DoubleSide} transparent={false} />
          </mesh>
        </group>
    );
};

export const VrProjectorOverlay = () => {
    return (
        <div className="pointer-events-none absolute inset-0 opacity-0 z-[-100]">
             <Canvas id="vr-canvas">
                  <XR store={xrStore}>
                     <ProjectorPlane />
                  </XR>
             </Canvas>
        </div>
    );
};
