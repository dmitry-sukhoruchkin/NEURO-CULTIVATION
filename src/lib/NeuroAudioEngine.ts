import { CultivationEngine } from './CultivationEngine';

export class NeuroAudioEngine {
    public ctx: AudioContext;
    private compressor: DynamicsCompressorNode;
    private convolver: ConvolverNode;

    private dryGain: GainNode;
    private delayNode: DelayNode;
    private delayFeedback: GainNode;

    // Synths
    private droneOsc: OscillatorNode;
    private droneGain: GainNode;
    private droneFilter: BiquadFilterNode;

    // Sonar Synths
    private exitBeaconOsc: OscillatorNode;
    private exitBeaconPanner: StereoPannerNode;
    private exitBeaconGain: GainNode;
    private wallRumbleNoise: AudioBufferSourceNode;
    private wallRumbleFilter: BiquadFilterNode;
    private wallRumbleGain: GainNode;

    private guideOsc: OscillatorNode;
    private guideFilter: BiquadFilterNode;
    private guidePanner: StereoPannerNode;
    private guideGain: GainNode;

    private fmCarrier: OscillatorNode;

    private fmMod: OscillatorNode;
    private fmModGain: GainNode;
    private fmCarrierGain: GainNode;
    private fmFilter: BiquadFilterNode;

    private baseOsc: OscillatorNode;
    private baseGain: GainNode;
    private subOsc: OscillatorNode;
    private subGain: GainNode;
    private modOsc: OscillatorNode;
    private modGain: GainNode;

    private noiseSrc: AudioBufferSourceNode;
    private noiseFilter: BiquadFilterNode;
    private noiseGain: GainNode;

    private lastAxes = new Float32Array(16);
    private lastKickTime = 0;
    private lastHatTime = 0;
    private lastBassTime = 0;

    // BPM Adaptive state
    private strumHistory: number[] = [0.43, 0.43, 0.43, 0.43]; 
    private rhythmLocked: boolean = false;
    private autoDrumsEnabled: boolean = false;
    private drumsHeld: boolean = false;
    private lockHeld: boolean = false;

    private kickMemory: number[];
    private bassMemory: number[];
    private hatMemory: number[];

    // Sequencer
    public bpm: number = 138;
    private nextNoteTime: number = 0;
    private currentStep: number = 0;
    private sequenceId: any = null;
    
    public currentMode: string = 'RhythmDJ';
    private lastMazePulseTime: number = 0;
    
    public fractalPathAngles: number[] = [0, 0, 0, 0];

    public get currentBPM(): number { return this.bpm; }
    public get isRhythmLocked(): boolean { return this.rhythmLocked; }
    public get isAutoDrums(): boolean { return this.autoDrumsEnabled; }

    private kickResidue: number[];
    private bassResidue: number[];
    private hatResidue: number[];

    // states from axes
    public currentAxes = new Float32Array(16);
    private currentAssist = 1.0;
    private currentChaos = 0.0;
    
    // Virtual spatial avatars for RhythmDJ
    public musicAvatars: {x: number, y: number, r: number}[] = [
        {x: 0, y: 0, r: 0},
        {x: 0, y: 0, r: 0},
        {x: 0, y: 0, r: 0},
        {x: 0, y: 0, r: 0}
    ];

    constructor() {
        this.kickMemory = new Array(16).fill(0);
        this.bassMemory = new Array(16).fill(0);
        this.hatMemory = new Array(16).fill(0);

        this.kickResidue = new Array(16).fill(0);
        this.bassResidue = new Array(16).fill(0);
        this.hatResidue = new Array(16).fill(0);

        // Initialize working memory with default psytrance pattern
        for(let i=0; i<16; i+=4) this.kickMemory[i] = 0.8;
        for(let i=0; i<16; i++) if (i%4 !== 0) this.bassMemory[i] = 0.5;
        for(let i=2; i<16; i+=4) this.hatMemory[i] = 0.4;

        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -12;
        this.compressor.connect(this.ctx.destination);
        
        this.convolver = this.ctx.createConvolver();
        this.convolver.connect(this.compressor);
        
        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.value = 0.8;
        this.dryGain.connect(this.compressor);

        this.delayNode = this.ctx.createDelay(2.0);
        this.delayFeedback = this.ctx.createGain();
        this.delayFeedback.gain.value = 0.4;
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);
        this.delayNode.connect(this.compressor);
        
        // Drone
        this.droneOsc = this.ctx.createOscillator();
        this.droneOsc.type = 'sawtooth';
        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.Q.value = 2.0;

        this.droneGain = this.ctx.createGain();
        this.droneGain.gain.value = 0;
        
        this.droneOsc.connect(this.droneFilter);
        this.droneFilter.connect(this.droneGain);
        this.droneGain.connect(this.dryGain);
        this.droneGain.connect(this.convolver);

        // Sonar Init
        this.exitBeaconOsc = this.ctx.createOscillator();
        this.exitBeaconOsc.type = 'sine';
        this.exitBeaconOsc.frequency.value = 432;
        this.exitBeaconGain = this.ctx.createGain();
        this.exitBeaconGain.gain.value = 0;
        this.exitBeaconPanner = this.ctx.createStereoPanner();
        this.exitBeaconOsc.connect(this.exitBeaconGain);
        this.exitBeaconGain.connect(this.exitBeaconPanner);
        this.exitBeaconPanner.connect(this.dryGain);

        this.wallRumbleGain = this.ctx.createGain();
        this.wallRumbleGain.gain.value = 0;
        this.wallRumbleFilter = this.ctx.createBiquadFilter();
        this.wallRumbleFilter.type = 'lowpass';
        this.wallRumbleFilter.frequency.value = 150;
        this.wallRumbleFilter.Q.value = 1.0;
        
        const rBuf = this.ctx.createBuffer(1, 48000, 48000);
        const rData = rBuf.getChannelData(0);
        for (let i = 0; i < rData.length; i++) rData[i] = Math.random() * 2 - 1;
        this.wallRumbleNoise = this.ctx.createBufferSource();
        this.wallRumbleNoise.buffer = rBuf;
        this.wallRumbleNoise.loop = true;

        this.wallRumbleNoise.connect(this.wallRumbleFilter);
        this.wallRumbleFilter.connect(this.wallRumbleGain);
        this.wallRumbleGain.connect(this.compressor);
        
        // Guide Path Sonar
        this.guideOsc = this.ctx.createOscillator();
        this.guideOsc.type = 'sawtooth';
        this.guideFilter = this.ctx.createBiquadFilter();
        this.guideFilter.type = 'lowpass';
        this.guidePanner = this.ctx.createStereoPanner();
        this.guideGain = this.ctx.createGain();
        this.guideGain.gain.value = 0;
        
        this.guideOsc.connect(this.guideFilter);
        this.guideFilter.connect(this.guideGain);
        this.guideGain.connect(this.guidePanner);
        this.guidePanner.connect(this.dryGain);

        // FM
        this.fmMod = this.ctx.createOscillator();
        this.fmModGain = this.ctx.createGain();
        this.fmCarrier = this.ctx.createOscillator();
        this.fmCarrierGain = this.ctx.createGain();
        this.fmFilter = this.ctx.createBiquadFilter();
        this.fmFilter.type = 'lowpass';
        
        this.fmMod.connect(this.fmModGain);
        this.fmModGain.connect(this.fmCarrier.frequency);
        this.fmCarrier.connect(this.fmFilter);
        this.fmFilter.connect(this.fmCarrierGain);
        this.fmCarrierGain.connect(this.dryGain);
        this.fmCarrierGain.connect(this.delayNode);

        // Noise
        this.noiseFilter = this.ctx.createBiquadFilter();
        this.noiseGain = this.ctx.createGain();
        this.noiseGain.gain.value = 0;
        const buf = this.ctx.createBuffer(1, 48000, 48000);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noiseSrc = this.ctx.createBufferSource();
        this.noiseSrc.buffer = buf;
        this.noiseSrc.loop = true;
        this.noiseSrc.connect(this.noiseFilter);
        this.noiseFilter.connect(this.noiseGain);
        this.noiseGain.connect(this.dryGain);

        this.baseOsc = this.ctx.createOscillator();
        this.baseOsc.type = 'sine';
        this.baseGain = this.ctx.createGain();
        this.baseGain.gain.value = 0;
        this.baseOsc.connect(this.baseGain);
        this.baseGain.connect(this.dryGain);

        this.subOsc = this.ctx.createOscillator();
        this.subOsc.type = 'sine';
        this.subGain = this.ctx.createGain();
        this.subGain.gain.value = 0;
        this.subOsc.connect(this.subGain);
        this.subGain.connect(this.dryGain);

        this.modOsc = this.ctx.createOscillator();
        this.modOsc.type = 'sine';
        this.modGain = this.ctx.createGain();
        this.modGain.gain.value = 0;
        this.modOsc.connect(this.modGain);
        this.modGain.connect(this.baseOsc.frequency);
    }

    public async initialize() {
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        const len = this.ctx.sampleRate * 2.5;
        const imp = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = imp.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.3));
        }
        this.convolver.buffer = imp;

        this.droneOsc.start();
        this.exitBeaconOsc.start();
        this.guideOsc.start();
        this.wallRumbleNoise.start();
        this.fmMod.start();
        this.fmCarrier.start();
        this.noiseSrc.start();
        this.baseOsc.start();
        this.subOsc.start();
        this.modOsc.start();

        this.nextNoteTime = this.ctx.currentTime + 0.1;
        if (!this.sequenceId) {
            this.sequenceId = setInterval(() => this.scheduler(), 25);
        }
    }

    private scheduler() {
        if (this.ctx.state !== 'running') return;
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            if (this.currentMode === 'RhythmDJ') {
                this.scheduleStep(this.currentStep, this.nextNoteTime);
            } else if (this.currentMode === 'BrainMaze') {
                this.scheduleMazeFractal(this.currentStep, this.nextNoteTime);
            }
            this.nextNoteTime += (60.0 / this.bpm) / 4.0;
            this.currentStep = (this.currentStep + 1) % 16;
        }
    }

    private getPentatonicNote(baseMidi: number, angleIndex: number): number {
        // Pentatonic Minor: 0, 3, 5, 7, 10
        // We use index from -4 to +4
        const degrees = [0, 3, 5, 7, 10];
        let idxOffset = angleIndex;
        let pMidi = baseMidi;
        
        while (idxOffset > 0) {
            pMidi += degrees[idxOffset % 5];
            idxOffset--;
        }
        while (idxOffset < 0) {
            pMidi -= degrees[(-idxOffset) % 5];
            // this isn't strictly correct for leaping octaves, let's just use an array map:
            idxOffset++;
        }
        return pMidi; 
    }

    private getDorianNote(baseMidi: number, angleIndex: number): number {
        // Dorian Scale: Intervals (0, 2, 3, 5, 7, 9, 10)
        // Let's just create a hardcoded symmetrical map for -4 to +4
        // -4=(-7) P5 down, -3=(-5) P4 down, -2=(-3) m3 down, -1=(-2) M2 down, 0=root, 1=(+2) M2 up, 2=(+3) m3 up, 3=(+5) P4 up, 4=(+7) P5 up
        const offsets = [-7, -5, -3, -2, 0, 2, 3, 5, 7];
        let clampedIdx = Math.max(-4, Math.min(4, angleIndex));
        return baseMidi + offsets[clampedIdx + 4];
    }

    private scheduleMazeFractal(step: number, time: number) {
        if (!this.fractalPathAngles || this.fractalPathAngles.length === 0) return;
        
        // Psytrance Radar - play 16th notes iterating through the path
        const pathAngleIndex = this.fractalPathAngles[step % this.fractalPathAngles.length];
        const note = this.getDorianNote(48, pathAngleIndex); 

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const panner = this.ctx.createStereoPanner();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(this.delayNode);
        panner.connect(this.dryGain);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440 * Math.pow(2, (note - 69) / 12), time);
        
        filter.type = 'lowpass';
        // Filter opens up if there's a sharp turn (+ or - index)
        filter.frequency.setValueAtTime(400 + Math.abs(pathAngleIndex) * 800, time);
        filter.frequency.exponentialRampToValueAtTime(100, time + 0.1);

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.3, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

        // Pan to match the relative angle of the turn
        panner.pan.setValueAtTime(Math.min(1, Math.max(-1, pathAngleIndex / 4)), time);

        osc.start(time);
        osc.stop(time + 0.15);
        
        // Add driving Psytrance kick drum on 1/4 notes and offbeat bass
        if (step % 4 === 0) {
            this.triggerKick(time, 0.8);
        } else if (step % 4 === 2) {
            // Offbeat bass
            const bOsc = this.ctx.createOscillator();
            const bGain = this.ctx.createGain();
            bOsc.connect(bGain);
            bGain.connect(this.compressor);
            bOsc.type = 'square';
            bOsc.frequency.setValueAtTime(440 * Math.pow(2, (36 - 69) / 12), time); // Note C2
            bGain.gain.setValueAtTime(0.5, time);
            bGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
            bOsc.start(time);
            bOsc.stop(time + 0.1);
        }
    }

    private triggerKick(time: number, vel: number) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.compressor);
        osc.type = 'sine';
        // Psytrance kick pitch envelope: very high short click dropping to sub frequencies
        osc.frequency.setValueAtTime(300 + vel * 100, time);
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.05); // Snap to sub
        osc.frequency.exponentialRampToValueAtTime(43, time + 0.15); // Slight bend

        gain.gain.setValueAtTime(vel * 1.5, time); // Punchy volume
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2); 
        
        osc.start(time);
        osc.stop(time + 0.25);
    }

    private triggerBass(time: number, vel: number, pitchOffset: number) {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.dryGain);

        osc.type = 'sawtooth';
        
        // Use the base frequency + scale mapping for continuous bass lines
        // If ax[8] is the pitch modifier, let's map it smoothly or discretely
        // In Psytrance bass usually stays on the root note (baseFreq: 55Hz) or moves in fifths.
        const currentScalePitch = this.baseFreq * (pitchOffset > 0 ? 1.5 : 1.0);
        osc.frequency.setValueAtTime(currentScalePitch, time);
        
        filter.type = 'lowpass';
        const freqTarget = 150 + (vel * 2000); 
        filter.frequency.setValueAtTime(freqTarget, time);
        filter.frequency.exponentialRampToValueAtTime(80, time + 0.08); // Snappy psy-bass filter decay
        filter.Q.value = 4.0;

        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vel * 0.8, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
        
        osc.start(time);
        osc.stop(time + 0.15);
    }

    private triggerHat(time: number, vel: number) {
        const bufferSize = this.ctx.sampleRate * 0.05; // shorter buffer
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        filter.type = 'bandpass'; // Bandpass gives a sharper 'ts' sound
        
        // High crisp frequency
        filter.frequency.value = 8000 + (this.currentAxes[5] || 0) * 2000;
        filter.Q.value = 1.5;
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.dryGain);

        // Very snappy envelope
        gain.gain.setValueAtTime(vel * 0.6, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.04); 
        
        noise.start(time);
        setTimeout(() => { filter.disconnect(); gain.disconnect(); }, 50);
    }

    private getQuantizedStep(now: number): number {
        if (this.bpm === 0) return 0;
        const stepDuration = (60.0 / this.bpm) / 4.0;
        const timeUntilNext = this.nextNoteTime - now;
        if (timeUntilNext > stepDuration / 2.0) {
            return (this.currentStep - 1 + 16) % 16;
        } else {
            return this.currentStep % 16;
        }
    }

    private scheduleStep(step: number, time: number) {
        const ax = this.currentAxes;
        const assist = this.currentAssist;
        
        // M1: The Rhythm Grid (Avatar 1: axes 0,1,2 -> X,Y,R)
        // M1.x defines drum pattern density/complexity
        // M1.y defines tempo (bpm) and groove
        // M1.r defines hihat filtering and swing
        
        const m1 = this.musicAvatars[0];
        
        // Dynamic continuous pattern generation from Spatial mapping
        // We evaluate complex sine networks over M1's position to get organic drum patterns
        const dist = Math.sqrt(m1.x*m1.x + m1.y*m1.y);
        const angle = Math.atan2(m1.y, m1.x);

        // Generative probability fields for the step
        const kProb = Math.sin(step * Math.PI / 2 + angle) * 0.5 + 0.5 + (dist > 2 ? 0.3 : 0);
        const bProb = Math.cos(step * Math.PI + angle * 2) * 0.5 + 0.5;
        const hProb = Math.sin(step * Math.PI / 4 + m1.r) * 0.5 + 0.5;

        // AutoDrums / Joystick Overrides
        if (ax[0] > 0.1) this.kickMemory[step] = ax[0];
        else if (ax[0] < -0.1) this.kickMemory[step] = 0;
        else if (!this.rhythmLocked) this.kickMemory[step] += (kProb - this.kickMemory[step]) * 0.1;

        if (ax[1] > 0.1) this.bassMemory[step] = ax[1];
        else if (ax[1] < -0.1) this.bassMemory[step] = 0;
        else if (!this.rhythmLocked) this.bassMemory[step] += (bProb - this.bassMemory[step]) * 0.1;

        if (ax[2] > 0.1) this.hatMemory[step] = ax[2];
        else if (ax[2] < -0.1) this.hatMemory[step] = 0;
        else if (!this.rhythmLocked) this.hatMemory[step] += (hProb - this.hatMemory[step]) * 0.1;

        // Super-dynamic rhythm retention
        if (!this.rhythmLocked && assist < 0.8) {
            this.kickMemory[step] *= 0.98; 
            this.bassMemory[step] *= 0.98;
            this.hatMemory[step] *= 0.98;
        }

        // --- FRACTAL CHAOTIZATION INTO SEMANTICS ---
        if (this.currentChaos > 0.01) {
            const fb = 4.6692016;
            const rChaos = 2.5 + this.currentChaos * (fb - 2.5);
            
            const nextStep = (step + 1) % 16;
            
            // Cross-coupled Logistic map step
            this.kickResidue[step] = rChaos * this.kickResidue[step] * (1.0 - this.bassResidue[nextStep]) + ax[0] * 0.1;
            this.bassResidue[step] = rChaos * this.bassResidue[step] * (1.0 - this.hatResidue[nextStep]) + ax[1] * 0.1;
            this.hatResidue[step] = rChaos * this.hatResidue[step] * (1.0 - this.kickResidue[nextStep]) + ax[2] * 0.1;
            
            this.kickResidue[step] = Math.max(0, Math.min(1.0, Math.abs(this.kickResidue[step])));
            this.bassResidue[step] = Math.max(0, Math.min(1.0, Math.abs(this.bassResidue[step])));
            this.hatResidue[step] = Math.max(0, Math.min(1.0, Math.abs(this.hatResidue[step])));

            this.kickMemory[step] += this.kickResidue[step] * this.currentChaos * 0.5;
            this.bassMemory[step] += this.bassResidue[step] * this.currentChaos * 0.5;
            this.hatMemory[step] += this.hatResidue[step] * this.currentChaos * 0.5;
        } else {
            this.kickResidue[step] *= 0.9;
            this.bassResidue[step] *= 0.9;
            this.hatResidue[step] *= 0.9;
        }

        // If system assist is high, gradually lock back to the default psytrance pattern
        if (assist >= 0.5) {
            const defKick = (step % 4 === 0) ? 0.8 : 0;
            const defBass = (step % 4 !== 0) ? 0.5 : 0;
            const defHat = (step % 4 === 2) ? 0.4 : 0;
            
            const restoreRate = (assist - 0.5) * 0.2; 
            this.kickMemory[step] += (defKick - this.kickMemory[step]) * restoreRate;
            this.bassMemory[step] += (defBass - this.bassMemory[step]) * restoreRate;
            this.hatMemory[step] += (defHat - this.hatMemory[step]) * restoreRate;
        }

        let kVol = this.kickMemory[step];
        let bVol = this.bassMemory[step];
        let hVol = this.hatMemory[step];

        // Auto-drums force the current pattern to maximum strength
        if (this.autoDrumsEnabled) {
             kVol = Math.max(kVol, (step % 4 === 0) ? 0.8 : 0);
             bVol = Math.max(bVol, (step % 4 !== 0) ? 0.5 : 0);
             hVol = Math.max(hVol, (step % 4 === 2) ? 0.4 : 0);
        }

        if (kVol > 0.1) this.triggerKick(time, kVol);
        if (bVol > 0.1) this.triggerBass(time, bVol, ax[2] > 0 ? 0.2 : 0);
        if (hVol > 0.1) this.triggerHat(time, hVol);
    }

    private scaleRatios = [1.0, 1.122, 1.259, 1.334, 1.498, 1.681, 1.887, 2.0, 2.244, 2.519, 2.669]; // Minor scale ratios
    private baseFreq = 55.0; // A1

    public updateRhythmAxes(axes: Float32Array, chaosBlend: number, instability: number, semanticModeOverride: boolean = false) {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        
        for (let i=0; i<16; i++) {
            this.currentAxes[i] = axes[i] || 0;
        }
        
        let targetAssist = Math.max(0, 1.0 - chaosBlend); 
        if (semanticModeOverride) {
            targetAssist = 0.0;
        }
        this.currentAssist = targetAssist;
        this.currentChaos = chaosBlend;

        // INTEGRATE SPATIAL AVATARS (2D spatial logic for music)
        // This bridges the Robot/Maze 2D mental map into Musical space.
        // Device 1: Axis 0 (X), Axis 1 (Y), Axis 2 (Rotation) 
        // Device 2: Axis 3, 4, 5, etc.
        const speed = 0.05;
        
        // Note: Axis 1 is inverted so pushing UP (negative) moves avatar UP (positive Y)
        this.musicAvatars[0].x += axes[0] * speed;
        this.musicAvatars[0].y += -axes[1] * speed;
        this.musicAvatars[0].r += axes[2] * speed;

        this.musicAvatars[1].x += axes[3] * speed;
        this.musicAvatars[1].y += -axes[4] * speed;
        this.musicAvatars[1].r += axes[5] * speed;

        this.musicAvatars[2].x += axes[6] * speed;
        this.musicAvatars[2].y += -axes[7] * speed;
        this.musicAvatars[2].r += axes[8] * speed;

        // Wrap boundaries inside a bounded torus
        for(let a of this.musicAvatars) {
            if (a.x > 10) a.x -= 20; if (a.x < -10) a.x += 20;
            if (a.y > 10) a.y -= 20; if (a.y < -10) a.y += 20;
            if (a.r > Math.PI) a.r -= Math.PI*2; if (a.r < -Math.PI) a.r += Math.PI*2;
        }

        // Toggles mapping
        if (axes[9] > 0.5 && !this.drumsHeld) {
            this.autoDrumsEnabled = !this.autoDrumsEnabled;
            this.drumsHeld = true;
        } else if (axes[9] < -0.5 && !this.lockHeld) {
            this.rhythmLocked = !this.rhythmLocked;
            this.lockHeld = true;
        } else if (Math.abs(axes[9]) < 0.2) {
            this.drumsHeld = false;
            this.lockHeld = false;
        }

        // Avatar 1: TEMPO CONTROL (Y)
        if (!this.rhythmLocked) {
             const targetBpm = 138 + (this.musicAvatars[0].y * 8); // mapped -80 to +80
             this.bpm = this.bpm * 0.95 + targetBpm * 0.05;
             this.bpm = Math.max(60, Math.min(this.bpm, 220));
        }

        // --- PSYTRANCE MUSICAL QUANTIZATION ---
        const getPitchMultiplier = (spatialCoord: number, octaveBase: number = 2.0) => {
            const normalized = Math.abs(spatialCoord / 10.0);
            const idx = Math.floor(normalized * (this.scaleRatios.length - 1));
            return this.scaleRatios[Math.max(0, Math.min(this.scaleRatios.length - 1, idx))] * octaveBase;
        };

        // Lead Synth (Avatar 2 or Avatar 1 if Avatar 2 is inactive)
        const m2Active = Math.abs(axes[3]) > 0.01 || Math.abs(axes[4]) > 0.01;
        const synthAvatar = m2Active ? this.musicAvatars[1] : this.musicAvatars[0];

        const leadMult = getPitchMultiplier(synthAvatar.y, 4.0); // Y controls pitch
        const leadPitch = this.baseFreq * leadMult;
        
        const fmModPitch = leadPitch * (synthAvatar.r > 0 ? 2.0 : 0.5); // Rotation controls harmony
        
        // Volume grows when you actively push the joystick (like an accelerator)
        const activeIntensity = Math.sqrt(axes[3]*axes[3] + axes[4]*axes[4]);
        const primaryIntensity = Math.sqrt(axes[0]*axes[0] + axes[1]*axes[1]);
        const leadVol = (m2Active ? activeIntensity : primaryIntensity) * 0.6;

        this.fmCarrier.frequency.setTargetAtTime(leadPitch, now, 0.05);
        this.fmMod.frequency.setTargetAtTime(fmModPitch, now, 0.05);
        this.fmModGain.gain.setTargetAtTime(1000 * Math.abs(synthAvatar.r), now, 0.05);
        this.fmFilter.frequency.setTargetAtTime(500 + Math.abs(synthAvatar.x / 10.0) * 6000, now, 0.05); 
        this.fmCarrierGain.gain.setTargetAtTime(leadVol, now, 0.02);

        // Drone / Pad (Avatar 3, or defaults)
        const padAvatar = this.musicAvatars[2];
        const droneVol = Math.abs(padAvatar.r / Math.PI) * 0.5 + Math.abs(axes[7]) * 0.5; 
        const droneMult = getPitchMultiplier(padAvatar.y, 1.0);
        this.droneGain.gain.setTargetAtTime(droneVol, now, 0.2);
        this.droneOsc.frequency.setTargetAtTime(this.baseFreq * droneMult, now, 0.2);
        
        const droneCutoff = 100 + droneVol * 2000 + Math.abs(padAvatar.x / 10.0) * 2000;
        this.droneFilter.frequency.setTargetAtTime(droneCutoff, now, 0.4);

        // Noise and Chaos (controlled by instability and Avatar 1 rotation)
        const noiseVol = Math.abs(synthAvatar.r / Math.PI) * 0.2 * instability;
        this.noiseGain.gain.setTargetAtTime(noiseVol, now, 0.1);
        this.noiseFilter.type = 'bandpass';
        this.noiseFilter.frequency.setTargetAtTime(2000 + Math.abs(synthAvatar.x / 10.0) * 6000, now, 0.1);

        // Delay Echo Feedback
        const fb = Math.abs(synthAvatar.r / Math.PI) * 0.85;
        this.delayFeedback.gain.setTargetAtTime(fb, now, 0.1);

        for (let i=0; i<16; i++) {
            this.lastAxes[i] = axes[i] || 0;
        }
    }

    public updateBlended(rawAxes: Float32Array, s: Float32Array, blend: number, level: number, instability: number) {
        if (this.ctx.state !== 'running') return;
        
        const faux = new Float32Array(16);
        if (s.length >= 32) {
            // For continuous rhythmic axes, we want to maintain the bipolar (-1..1) mapping
            // Kick Intent: Exploding violent detonation (21) vs Spiritual Sense (13) or Stillness (22)
            faux[0] = s[21] - s[22]; 
            
            // Bass: Earth (4) (+) vs Wind (6) (-)
            faux[1] = s[4] - s[6];  
            
            // FM Pitch: Golden Core (12) (+) vs Metal (0) (-) 
            faux[2] = s[12] - s[0];  
            
            // Hats Intent: Iron armor (25) (+) vs Water (2) (-)
            // Spike hits also feed into Iron armor for sharp attacks
            faux[4] = s[25] - s[2];  
            
            // FM Volume/Drive: Sword Intent (+) vs Yin Yang (-)
            faux[3] = s[11] - s[14]; 
            
            // Chaos/Noise Vol tracks turbulence: Chaos Tear (+) vs Stillness (-)
            faux[5] = s[15] - s[22]; 
            
            // Delay Echo Void: Void (+) vs Radiant Core (-)
            faux[6] = s[31] - s[12];
            
            // Drone Volume (Pill Hum): Contracting Condensing (+) vs Formless Mist (-)
            faux[7] = s[19] - s[26]; 
            
            // For other axes, just copy over or leave as 0
            // Axes 8 and 9 (D-pad lock mapping) can also come from semantic state
            faux[8] = s[1] - s[3];
            faux[9] = s[18] - s[20];
        }

        const blended = new Float32Array(16);
        for(let i=0; i<16; i++) {
            // Restore proper blend across all axes. 
            // In Semantic mode, blend will eventually reach 1.0. 
            // If the user wants immediate semantic audio, they can slide manualBlend to 1.0.
            blended[i] = rawAxes[i] * (1.0 - blend) + faux[i] * blend;
        }

        // --- CRITICAL FIX STRICTLY FOR NEUROFEEDBACK ---
        // Ensure that the drum intent spike (Pill Signal) is ALWAYS passed through to the Kick and Hat
        // so the user receives zero-latency auditory feedback during refining, even in true Classic mode.
        if (s.length >= 32) {
            blended[0] = Math.max(Math.abs(blended[0]), s[21] * blend); // Kick/Spike Force
            blended[4] = Math.max(Math.abs(blended[4]), s[25] * blend); // Hat Force
        }

        this.updateRhythmAxes(blended, blend, instability, blend > 0.5);
    }

    public updateArenaAudio(playerPos: {x: number, y: number, z: number}, enemyPos: {x: number, y: number, z: number} | null, activeBoost: number, focusIntensity: number, bladeIntensity: number = 0) {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        
        let threatLevel = 0;
        let threatPan = 0;
        
        if (enemyPos) {
            let dx = enemyPos.x - playerPos.x;
            let dz = enemyPos.z - playerPos.z;
            let dist = Math.sqrt(dx*dx + dz*dz);
            threatLevel = Math.max(0, 1.0 - dist / 30.0); // 0 to 1 based on proximity
            
            // Pan based on X relative to player (simplistic since we don't know player rotation perfectly here)
            threatPan = Math.max(-1, Math.min(1, dx / (dist + 0.1)));
        }

        // Modulate drone for tension
        let droneVol = 0.2 + threatLevel * 0.4 + activeBoost * 0.1;
        this.droneGain.gain.setTargetAtTime(droneVol, now, 0.1);
        
        let droneCutoff = 200 + threatLevel * 1000 + focusIntensity * 2000;
        this.droneFilter.frequency.setTargetAtTime(droneCutoff, now, 0.1);
        
        // Use noise for active clash/action
        let noiseVol = Math.max(0, (activeBoost - 1.0) / 4.0) * 0.3;
        this.noiseGain.gain.setTargetAtTime(noiseVol, now, 0.1);
        this.noiseFilter.type = 'lowpass';
        this.noiseFilter.frequency.setTargetAtTime(300 + focusIntensity * 4000, now, 0.1);

        // Turn down FM synth unless there is high focus
        this.fmCarrierGain.gain.setTargetAtTime(focusIntensity * 0.4 + bladeIntensity * 0.5, now, 0.2);
        this.fmMod.frequency.setTargetAtTime(120 + bladeIntensity * 800, now, 0.1);
        this.fmModGain.gain.setTargetAtTime(100 + bladeIntensity * 1500, now, 0.1);
    }

    private droneMotors: { osc: OscillatorNode, gain: GainNode }[] = [];

    public updateDroneMotors(throttle: number, roll: number, pitch: number, yaw: number) {
        if (this.ctx.state !== 'running') return;
        
        // lazy init drone motors
        if (this.droneMotors.length === 0) {
            for (let i = 0; i < 4; i++) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sawtooth';
                const gain = this.ctx.createGain();
                gain.gain.value = 0;
                
                // Add soft lowpass to make it sound like a drone (less harsh)
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 800; // Drone props are whiny, but we cut extreme highs
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.dryGain);
                osc.start();
                this.droneMotors.push({ osc, gain });
            }
        }
        
        // Quadcopter motor mixing (X configuration)
        // FL, FR, BL, BR
        const m1 = Math.max(0, throttle - pitch + roll + yaw);
        const m2 = Math.max(0, throttle - pitch - roll - yaw);
        const m3 = Math.max(0, throttle + pitch + roll - yaw);
        const m4 = Math.max(0, throttle + pitch - roll + yaw);
        
        const motors = [m1, m2, m3, m4];
        const now = this.ctx.currentTime;
        
        for (let i = 0; i < 4; i++) {
            // Drone idling frequency ~100Hz, max throttle ~600Hz
            // When throttle is 0 and on ground, maybe 0. But in air it would be spinning.
            const rpm = Math.max(0, motors[i]);
            const freq = 100 + rpm * 500;
            // Volume is based on RPM
            const vol = Math.min(0.2, rpm * 0.15); 
            
            this.droneMotors[i].osc.frequency.setTargetAtTime(freq, now, 0.05);
            this.droneMotors[i].gain.gain.setTargetAtTime(vol, now, 0.05);
        }
    }

    public updateCzRailgun(charge: number, fired: boolean) {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        
        charge = isNaN(charge) ? 0 : Math.max(0, charge);
        
        const chargeFreq = 50 + charge * 400; // Drone ascending in pitch
        const chargeVol = Math.min(charge * 0.5, 0.5);
        
        this.baseOsc.frequency.setTargetAtTime(chargeFreq, now, 0.1);
        this.baseGain.gain.setTargetAtTime(chargeVol, now, 0.1);

        if (fired) {
            this.noiseGain.gain.cancelScheduledValues(now);
            this.noiseGain.gain.setValueAtTime(0.8, now);
            this.noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
            
            this.fmCarrierGain.gain.cancelScheduledValues(now);
            this.fmCarrierGain.gain.setValueAtTime(0.8, now);
            this.fmCarrierGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
            this.fmCarrier.frequency.setValueAtTime(800, now);
            this.fmCarrier.frequency.exponentialRampToValueAtTime(100, now + 1.0);
        }
    }

    public updateDlpfcMonolith(density: number, impacts: number) {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        density = isNaN(density) ? 0 : Math.max(0, density);
        
        // Deep resonance based on density
        this.subOsc.frequency.setTargetAtTime(30 + density * 50, now, 0.2);
        this.subGain.gain.setTargetAtTime(0.1 + density * 0.3, now, 0.2);

        if (impacts > 0) {
            // Rhythmic thuds on impacts
            this.noiseGain.gain.cancelScheduledValues(now);
            this.noiseGain.gain.setValueAtTime(0.4 * impacts, now);
            this.noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            this.noiseFilter.frequency.setValueAtTime(200, now);
        }
    }

    public updateOzFractal(zoom: number) {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        zoom = isNaN(zoom) ? 0 : zoom;
        
        // High pitched sweeping overtones
        const baseFreq = 100 + Math.abs(zoom * 200) % 800;
        this.baseOsc.frequency.setTargetAtTime(baseFreq, now, 0.1);
        this.baseGain.gain.setTargetAtTime(0.3, now, 0.1);
        
        this.fmCarrier.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.1);
        this.fmCarrierGain.gain.setTargetAtTime(0.2, now, 0.1);
    }

    public updateFpQuantum(isIce: boolean, triggeredShift: boolean) {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        // Background tone differentiates lava / ice
        this.modOsc.frequency.setTargetAtTime(isIce ? 400 : 80, now, 0.2);
        this.modGain.gain.setTargetAtTime(50, now, 0.2);
        this.subGain.gain.setTargetAtTime(0.2, now, 0.2);

        if (triggeredShift) {
            this.baseOsc.frequency.setValueAtTime(isIce ? 1000 : 200, now);
            this.baseOsc.frequency.exponentialRampToValueAtTime(isIce ? 200 : 800, now + 0.4);
            this.baseGain.gain.setValueAtTime(0.6, now);
            this.baseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        }
    }

    public updateMazeSonar(player: any, maze: any, sharpness: number, activeBoost: number, intentAngle: number, moveDx: number = 0, moveDy: number = 0) {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;

        let px = Math.floor(player.x);
        let py = Math.floor(player.y);
        let exitX = -1, exitY = -1;
        for (let y = 0; y < maze.dim; y++) {
            for (let x = 0; x < maze.dim; x++) {
                if (maze.grid[y][x] === 2) {
                    exitX = x + 0.5;
                    exitY = y + 0.5;
                    break;
                }
            }
        }
        
        let pathDist = 1;
        let beaconVol = 0;
        let beaconPan = 0;
        
        let guideFreq = 220;
        let guideCutoff = 400;
        let guideVol = 0;
        let guidePan = 0;

        if (exitX !== -1 && exitY !== -1) {
            let dx = exitX - player.x;
            let dy = exitY - player.y;
            let distToExit = Math.sqrt(dx*dx + dy*dy);
            
            // Path BFS from Exit to Player to find the next step
            let ex = Math.floor(exitX);
            let ey = Math.floor(exitY);
            let q = [{x: ex, y: ey, d: 0}];
            let visited = new Map<string, {x: number, y: number}>();
            visited.set(`${ex},${ey}`, {x: -1, y: -1});
            let found = false;
            let checks = 0;
            
            while(q.length > 0 && checks < 400) {
                checks++;
                let curr = q.shift()!;
                if (curr.x === px && curr.y === py) {
                    pathDist = curr.d;
                    found = true;
                    break;
                }
                const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
                for (let i=0; i<4; i++) {
                    let nx = curr.x + dirs[i][0];
                    let ny = curr.y + dirs[i][1];
                    if (nx >= 0 && nx < maze.dim && ny >= 0 && ny < maze.dim) {
                        if (maze.grid[ny][nx] !== 1 && !visited.has(`${nx},${ny}`)) {
                            visited.set(`${nx},${ny}`, {x: curr.x, y: curr.y});
                            q.push({x: nx, y: ny, d: curr.d + 1});
                        }
                    }
                }
            }
            if (!found) pathDist = Math.floor(Math.abs(ex-px) + Math.abs(ey-py));

            // Guide Logic
            if (found) {
                // Trace full path
                let pathList: {x:number, y:number}[] = [];
                let cx = px;
                let cy = py;
                while (cx !== -1 && cy !== -1) {
                    pathList.push({x: cx + 0.5, y: cy + 0.5});
                    let pStep = visited.get(`${cx},${cy}`);
                    if (!pStep || pStep.x === -1) break;
                    cx = pStep.x;
                    cy = pStep.y;
                }
                pathList.push({x: exitX, y: exitY});
                
                let facingAngle = Math.atan2(-Math.cos(player.angle), Math.sin(player.angle));
                
                // Calculate fractal angles at 4 scales for sequence arpeggiator radar
                const getAngleIdx = (targetDist: number) => {
                    let targetIdx = Math.min(pathList.length - 1, targetDist);
                    let targetPt = pathList[targetIdx];
                    let pdx = targetPt.x - player.x;
                    let pdy = targetPt.y - player.y;
                    let pAngle = Math.atan2(pdy, pdx);
                    let rAngle = Math.atan2(Math.sin(pAngle - facingAngle), Math.cos(pAngle - facingAngle));
                    return Math.round((rAngle / Math.PI) * 4);
                };

                this.fractalPathAngles = [];
                for(let s=0; s<16; s++) {
                    this.fractalPathAngles.push(getAngleIdx(Math.max(1, s)));
                }

                let nextStepX = exitX;
                let nextStepY = exitY;
                if (pathList.length > 2) {
                     nextStepX = pathList[2].x;
                     nextStepY = pathList[2].y;
                } else if (pathList.length > 1) {
                     nextStepX = pathList[1].x;
                     nextStepY = pathList[1].y;
                }

                let pathDx = nextStepX - player.x;
                let pathDy = nextStepY - player.y;
                
                let pathAngle = Math.atan2(pathDy, pathDx);
                
                // Use intentAngle (cognitive sweep) instead of just physical facing
                // but we also mix in physical facing if sweep is inactive.
                // Wait, if sharpness (sweep_mag) > 0.05, we use intentAngle.
                let effectiveAngle = sharpness > 0.1 ? intentAngle : facingAngle;
                
                let relAngle = Math.atan2(
                    Math.sin(pathAngle - effectiveAngle), 
                    Math.cos(pathAngle - effectiveAngle)
                );
                
                guidePan = Math.sin(relAngle);
                
                let playerSpeed = Math.sqrt(moveDx*moveDx + moveDy*moveDy);
                let pathVecMag = Math.sqrt(pathDx*pathDx + pathDy*pathDy) || 1;
                let normPathX = pathDx / pathVecMag;
                let normPathY = pathDy / pathVecMag;
                
                let alignment = 0;
                // If the user is sending a strong sweep, alignment is based on the sweep ray
                if (sharpness > 0.1) {
                     let sweepDx = Math.cos(intentAngle);
                     let sweepDy = Math.sin(intentAngle);
                     alignment = sweepDx * normPathX + sweepDy * normPathY;
                } else if (playerSpeed > 0.005) {
                     alignment = (moveDx * normPathX + moveDy * normPathY) / playerSpeed;
                }
                
                guideVol = sharpness > 0.1 ? 0.3 * sharpness : 0.15;
                
                if (sharpness > 0.1 || playerSpeed > 0.005) {
                    if (alignment > 0) {
                        guideFreq = 220 + alignment * 440; 
                        guideCutoff = 800 + alignment * 2000;
                    } else {
                        guideFreq = 220 + alignment * 110; 
                        guideCutoff = 400 + alignment * 200; 
                    }
                } else {
                    guideFreq = 220; 
                    guideCutoff = 600;
                }
            }

            // Volume increases as we get closer
            beaconVol = Math.max(0.02, 0.4 / Math.max(1, distToExit * 0.2));

            let exitWorldAngle = Math.atan2(dy, dx); 
            let facingAngle = Math.atan2(-Math.cos(player.angle), Math.sin(player.angle));
            let effectiveAngle = sharpness > 0.1 ? intentAngle : facingAngle;
            
            let relativeAngle = Math.atan2(
                Math.sin(exitWorldAngle - effectiveAngle), 
                Math.cos(exitWorldAngle - effectiveAngle)
            );
            
            beaconPan = Math.sin(relativeAngle);
            
            this.exitBeaconOsc.frequency.setTargetAtTime(432 + (sharpness * 50), now, 0.1);
        }

        // Pulse triggered by pathDist
        if (this.currentMode === 'BrainMaze') {
            let pulseInterval = Math.max(0.1, pathDist * 0.05);
            // Speed up pulse if sweep is aligned!
            if (sharpness > 0.1) pulseInterval *= 0.5;
            
            if (now > this.lastMazePulseTime + pulseInterval) {
                this.lastMazePulseTime = now;
                this.triggerMazePulse(now, activeBoost, pathDist, sharpness);
            }
        }

        this.exitBeaconGain.gain.setTargetAtTime(beaconVol, now, 0.1);
        this.exitBeaconPanner.pan.setTargetAtTime(beaconPan, now, 0.1);

        this.guideOsc.frequency.setTargetAtTime(guideFreq, now, 0.1);
        this.guideFilter.frequency.setTargetAtTime(guideCutoff, now, 0.1);
        this.guideGain.gain.setTargetAtTime(guideVol, now, 0.1);
        this.guidePanner.pan.setTargetAtTime(guidePan, now, 0.1);

        // Wall Rumble Logic: sum of inverted distances to nearby walls
        let rumble = 0;
        for(let dy=-2; dy<=2; dy++) {
            for(let dx=-2; dx<=2; dx++) {
                let checkX = px + dx;
                let checkY = py + dy;
                if (checkX >= 0 && checkX < maze.dim && checkY >= 0 && checkY < maze.dim) {
                    if (maze.grid[checkY][checkX] === 1) {
                        let wDx = (checkX + 0.5) - player.x;
                        let wDy = (checkY + 0.5) - player.y;
                        let wDist = Math.sqrt(wDx*wDx + wDy*wDy);
                        rumble += Math.max(0, 1.5 - wDist);
                    }
                } else {
                    rumble += 0.5; // Bounds count as walls
                }
            }
        }
        
        let rumbleVol = Math.min(0.5, (rumble / 6.0) * 0.3 * (1 + activeBoost * 0.5));
        let rumbleCutoff = 100 + (rumbleVol * 800) + (activeBoost * 200);

        this.wallRumbleGain.gain.setTargetAtTime(rumbleVol, now, 0.1);
        this.wallRumbleFilter.frequency.setTargetAtTime(rumbleCutoff, now, 0.1);
    }

    public muteSonar() {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        this.exitBeaconGain.gain.setTargetAtTime(0, now, 0.1);
        this.wallRumbleGain.gain.setTargetAtTime(0, now, 0.1);
        this.guideGain.gain.setTargetAtTime(0, now, 0.1);
        
        for (let m of this.droneMotors) {
            m.gain.gain.setTargetAtTime(0, now, 0.1);
        }
    }

    public setMode(mode: string) {
        this.currentMode = mode;
        const now = this.ctx.currentTime;
        if (mode !== 'BrainMaze') {
            this.muteSonar();
        }
        if (mode !== 'RhythmDJ' && mode !== 'Refining') {
            // mute Rhythm stuff
            this.fmCarrierGain.gain.setTargetAtTime(0, now, 0.1);
            this.droneGain.gain.setTargetAtTime(0, now, 0.1);
            this.noiseGain.gain.setTargetAtTime(0, now, 0.1);
        }
        if (mode !== 'PhaseVortex') {
            this.cleanupPhaseVortexAudio();
        }
    }

    private triggerMazePulse(time: number, activeBoost: number, pathDist: number, sharpness: number = 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.delayNode); 
        gain.connect(this.dryGain);

        osc.type = sharpness > 0.1 ? 'square' : 'sine'; // Cognitive scan uses square/saw pulse
        if (sharpness > 0.1) {
             const filter = this.ctx.createBiquadFilter();
             filter.type = 'bandpass';
             filter.Q.value = 5.0;
             filter.frequency.setValueAtTime(800 + sharpness * 2000, time);
             osc.disconnect();
             osc.connect(filter);
             filter.connect(gain);
        }

        const baseFreq = Math.min(800, 200 + (30 / Math.max(1, pathDist)) * 100);
        osc.frequency.setValueAtTime(baseFreq + (sharpness * 200), time);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, time + 0.1);

        const vol = (0.3 + sharpness * 0.2) * (1 + activeBoost * 0.5);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, time + (sharpness > 0.1 ? 0.1 : 0.2));
        
        osc.start(time);
        osc.stop(time + 0.25);
    }

    private lastRefinePulseTime = 0;
    
    public updateRefiningAudio(progress: number, instability: number, activeBoost: number) {
        if (this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        
        let droneVol = 0.4 * activeBoost;
        // Make the drone cutoff sweep dynamically based on progress and instability
        let droneCutoff = 150 + progress * 2000 + (Math.sin(now * 2) * 500) + instability * 4000;
        this.droneGain.gain.setTargetAtTime(droneVol, now, 0.1);
        this.droneFilter.frequency.setTargetAtTime(droneCutoff, now, 0.1);
        
        // Modulate FM based on instability so it's not a static drone
        this.fmCarrierGain.gain.setTargetAtTime(instability * 0.5, now, 0.1);
        this.fmModGain.gain.setTargetAtTime(600 * instability, now, 0.1);
        this.fmFilter.frequency.setTargetAtTime(400 + progress * 1000, now, 0.1);
        
        // Heartbeat pulse that gets faster with progress
        let interval = Math.max(0.1, 1.5 - progress * 1.2); 
        if (now > this.lastRefinePulseTime + interval) {
             this.lastRefinePulseTime = now;
             
             // Dynamic synth pluck for the pulse instead of just a kick
             const note = 48 + Math.floor(progress * 12) + (Math.random() > 0.8 ? 7 : 0);
             const osc = this.ctx.createOscillator();
             const gain = this.ctx.createGain();
             const filter = this.ctx.createBiquadFilter();
             
             osc.connect(filter);
             filter.connect(gain);
             gain.connect(this.delayNode);
             gain.connect(this.compressor);
             
             osc.type = instability > 0.5 ? 'sawtooth' : 'triangle';
             osc.frequency.setValueAtTime(440 * Math.pow(2, (note - 69) / 12), now);
             
             filter.type = 'lowpass';
             filter.frequency.setValueAtTime(800 + instability * 2000, now);
             filter.frequency.exponentialRampToValueAtTime(100, now + 0.2);
             
             gain.gain.setValueAtTime(0, now);
             gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
             gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
             
             osc.start(now);
             osc.stop(now + 0.35);
             
             // Keep the sub kick for heavy impact
             const kOsc = this.ctx.createOscillator();
             const kGain = this.ctx.createGain();
             kOsc.connect(kGain);
             kGain.connect(this.compressor);
             kOsc.type = 'sine';
             kOsc.frequency.setValueAtTime(60 + instability * 40, now);
             kOsc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
             kGain.gain.setValueAtTime(1.0, now);
             kGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
             kOsc.start(now);
             kOsc.stop(now + 0.3);
        }
    }

    // ----- PHASE VORTEX SONIFICATION -----
    private pvPhaseOscs: OscillatorNode[] = [];
    private pvPhaseGains: GainNode[] = [];
    private pvPhaseLFOs: OscillatorNode[] = [];
    private pvPhaseLFOGains: GainNode[] = [];
    private pvGlobalDrone: OscillatorNode | null = null;
    private pvGlobalGain: GainNode | null = null;
    private pvFilter: BiquadFilterNode | null = null;
    private pvInitialized: boolean = false;

    public updatePhaseVortexAudio(localVortices: {x: number, y: number, tq: number, shiftX: number, shiftY: number}[], globalTq: number, globalVx: number, globalVy: number) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        if (!this.pvInitialized) {
            this.pvFilter = this.ctx.createBiquadFilter();
            this.pvFilter.type = 'lowpass';
            this.pvFilter.frequency.value = 400;
            this.pvFilter.connect(this.compressor);

            this.pvGlobalDrone = this.ctx.createOscillator();
            this.pvGlobalDrone.type = 'sawtooth';
            this.pvGlobalDrone.frequency.value = 55; // Low A
            this.pvGlobalGain = this.ctx.createGain();
            this.pvGlobalGain.gain.value = 0;
            this.pvGlobalDrone.connect(this.pvGlobalGain);
            this.pvGlobalGain.connect(this.pvFilter);
            this.pvGlobalDrone.start();

            // Pool of oscillators for local vortices
            for (let i = 0; i < 16; i++) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                
                const gain = this.ctx.createGain();
                gain.gain.value = 0;
                
                const lfo = this.ctx.createOscillator();
                lfo.type = 'sine';
                
                const lfoGain = this.ctx.createGain();
                lfoGain.gain.value = 0;
                
                osc.connect(gain);
                lfo.connect(lfoGain);
                lfoGain.connect(gain.gain); // Amplitude Modulation
                
                gain.connect(this.pvFilter);
                osc.start();
                lfo.start();
                
                this.pvPhaseOscs.push(osc);
                this.pvPhaseGains.push(gain);
                this.pvPhaseLFOs.push(lfo);
                this.pvPhaseLFOGains.push(lfoGain);
            }
            this.pvInitialized = true;
        }

        const now = this.ctx.currentTime;
        
        // 1. Sonify the Global Gamepad (Torque & Shift)
        const globalMag = Math.sqrt(globalVx * globalVx + globalVy * globalVy);
        const absTq = Math.abs(globalTq);
        
        // Filter opens up as there is more global coherent movement (shift or torque)
        const targetCutoff = 400 + Math.min(2000, (globalMag + absTq) * 3000);
        this.pvFilter!.frequency.setTargetAtTime(targetCutoff, now, 0.1);

        // Drone amplitude increases with global torque
        const targetDroneGain = Math.min(0.2, absTq * 0.4);
        this.pvGlobalGain!.gain.setTargetAtTime(targetDroneGain, now, 0.1);
        
        // Drone pitch bends slightly with global shift direction
        const shiftAngle = Math.atan2(globalVy, globalVx);
        const pitchBend = (globalMag > 0.05) ? (shiftAngle / Math.PI) * 5 : 0; // +/- 5 Hz
        this.pvGlobalDrone!.frequency.setTargetAtTime(55 + pitchBend, now, 0.1);

        // 2. Sonify Local Vortices (Proto-gamepads)
        // Each vortex gets its own AM speed (LFO) based on its torque,
        // and its pitch based on its chirality and position.
        
        for (let i = 0; i < 16; i++) {
            const osc = this.pvPhaseOscs[i];
            const gain = this.pvPhaseGains[i];
            const lfo = this.pvPhaseLFOs[i];
            const lfoGain = this.pvPhaseLFOGains[i];
            
            if (i < localVortices.length) {
                const v = localVortices[i];
                const absLocalTq = Math.abs(v.tq);
                
                // Spin speed (LFO) maps to absolute torque of this specific vortex
                // Faster rotation = faster wub-wub
                const lfoSpeed = Math.max(1.0, Math.min(30.0, absLocalTq * 200.0));
                lfo.frequency.setTargetAtTime(lfoSpeed, now, 0.1);
                
                // Pitch based on chirality and spatial position
                const isCCW = v.tq > 0;
                
                // CCW (Green) = Higher, CW (Magenta) = Lower
                const basePitch = isCCW ? 220 : 110;
                
                // Position offset (x, y range usually -10 to +10)
                const posOffset = (v.x + v.y) * 1.5;
                osc.frequency.setTargetAtTime(basePitch + posOffset, now, 0.1);
                
                // Volume based on shift magnitude and torque (how active this proto-gamepad is)
                const localShiftMag = Math.sqrt(v.shiftX * v.shiftX + v.shiftY * v.shiftY);
                const targetVol = Math.min(0.15, 0.02 + localShiftMag * 1.0 + absLocalTq * 0.5);
                
                // AM setup: base gain is half, LFO modulates the other half
                gain.gain.setTargetAtTime(targetVol * 0.5, now, 0.1);
                lfoGain.gain.setTargetAtTime(targetVol * 0.5, now, 0.1);
            } else {
                // Inactive
                gain.gain.setTargetAtTime(0, now, 0.1);
                lfoGain.gain.setTargetAtTime(0, now, 0.1);
            }
        }
    }

    public cleanupPhaseVortexAudio() {
        if (this.pvInitialized) {
            const now = this.ctx.currentTime;
            if (this.pvGlobalGain) this.pvGlobalGain.gain.setTargetAtTime(0, now, 0.1);
            for (const g of this.pvPhaseGains) {
                g.gain.setTargetAtTime(0, now, 0.1);
            }
            for (const g of this.pvPhaseLFOGains) {
                g.gain.setTargetAtTime(0, now, 0.1);
            }
        }
    }
}
