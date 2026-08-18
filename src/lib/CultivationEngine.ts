import { BleService } from "./BleService";

export class CultivationEngine {
    private static instance: CultivationEngine;
    
    public level: number = 1;
    public progress: number = 0.0;
    public instability: number = 0.0;
    public autoProgression: boolean = false; 

    public inputHalfLife: number = 0.2; // Smoothing delay
    public driftHalfLife: number = 0.1; // Magnetic center pull
    
    public consensusVolume: number = 0;
    public reqConsensus: number = 5;

    public _lastInput: Float32Array = new Float32Array(16);

    public static getInstance() {
        if (!CultivationEngine.instance) {
            CultivationEngine.instance = new CultivationEngine();
        }
        return CultivationEngine.instance;
    }

    public getLevelName(): string {
        switch(this.level) {
            case 1: return "I: Qi Condensation (Phase-Locking)";
            case 2: return "II: Foundation Building (Phase-Amplitude Capture)";
            case 3: return "III: Golden Core (Topological Consensus)";
            case 4: return "IV: Nascent Soul (Absolute Freedom)";
            default: return "Unknown";
        }
    }

    public update(dt: number, currentInput: Float32Array): void {
        const ble = BleService.getInstance();
        
        let isStable = false;
        let flow = 0;

        if (ble.isConnected) {
            // SCIENTIFIC NEUROFEEDBACK based on WM 2.0 (Miller) and Thousand Brains (Hawkins)
            const consensusVolume = ble.topologicalConsensus; // How many cortical columns agree
            const phaseDrift = ble.phaseDrift; // Variance in synapic phase
            
            this.consensusVolume = consensusVolume;
            this.instability = phaseDrift; // Direct mapping to phase variance
            
            let reqConsensus = 0;
            switch (this.level) {
                case 1: reqConsensus = 5; break;  // Easy phase-locking
                case 2: reqConsensus = 15; break; // Cross-frequency capture
                case 3: reqConsensus = 30; break; // Massive topology consensus
                case 4: reqConsensus = 50; break; 
            }
            this.reqConsensus = reqConsensus;

            if (phaseDrift < 0.5 && consensusVolume >= reqConsensus) {
                isStable = true;
            }
        } else {
            // Fallback to controller jitter logic if no BLE
            let jitter = 0;
            for(let i=0; i<16; i++) {
                jitter += Math.abs(currentInput[i] - this._lastInput[i]);
                flow += Math.abs(currentInput[i]);
                this._lastInput[i] = currentInput[i];
            }
            let jitterRate = jitter / Math.max(dt, 0.001);
            isStable = jitterRate < 50.0 && flow > 0.05;
            if (isStable) {
                this.instability = Math.max(0, this.instability - dt * 0.5);
            } else if (jitterRate >= 50.0) {
                this.instability += dt * 0.6;
            } else {
                this.instability = Math.max(0, this.instability - dt * 0.1);
            }
        }

        if (isStable) {
            this.progress += dt * 0.1; // 10 seconds to level up
        } else {
            this.progress = Math.max(0, this.progress - dt * 0.2);
        }

        // Breakthrough Logic
        if (this.autoProgression) {
            if (this.progress >= 1.0) {
                if (this.level < 4) {
                    this.level++;
                    this.progress = 0;
                } else {
                    this.progress = 1.0;
                }
            }
            if (this.instability >= 0.95 && this.progress === 0 && this.level > 1) {
                // Heart Demon / Regression due to phase chaos
                this.level--;
                this.progress = 0.5; // Bump back
                this.instability = 0;
            }
        } else {
            if (this.progress >= 1.0) this.progress = 1.0;
            if (this.instability >= 1.0) this.instability = 1.0;
        }

        // Apply Realm Laws (0 delay at all times per user requirement)
        this.inputHalfLife = 0.0; // ZERO LATENCY ALWAYS

        switch(this.level) {
            case 1:
                this.driftHalfLife = 0.3;  // Fast return to Semantic Anchor
                break;
            case 2:
                this.driftHalfLife = 0.8;  // Medium return
                break;
            case 3:
                this.driftHalfLife = 2.0;  // Very slow return (Free Drift starts here)
                break;
            case 4:
                this.driftHalfLife = 9999.0; // Infinite (No return, absolute freedom)
                break;
        }
    }
}
