import { BleService } from './BleService';
import { InputService } from './InputService';

const vertexShaderSource = `
    attribute vec2 position;
    void main() {
        gl_Position = vec4(position, 0.0, 1.0);
    }
`;

const fragmentShaderSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform sampler2D u_latentData;
    uniform float u_interference;
    uniform int u_mode; 
    uniform int u_dim;
    uniform float u_quality;

    mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
    }

    float hash(float n) { return fract(sin(n) * 43758.5453123); }
    vec3 hash3(float n) {
        return fract(sin(vec3(n, n + 1.0, n + 2.0)) * vec3(43758.5453123, 22578.1459123, 19642.3490423));
    }

    float getLatent(int i) {
        if (i >= u_dim) return 0.0;
        int tx = i / 32; 
        int ty = i - tx * 32;
        vec2 uv = vec2((float(ty) + 0.5) / 32.0, (float(tx) + 0.5) / 32.0);
        return texture2D(u_latentData, uv).x * 4.0 - 2.0;
    }

    struct Semantics {
        float metal, wood, water, fire, earth, lightning, wind, ice;
        float pure_qi, demonic_qi, blood_essence, sword_intent, golden_core, spiritual_sense, yin_yang, chaos_tear;
        float rising, sinking, expanding, contracting, spiraling, exploding, still, flowing;
        float jade, iron, mist, fractal_array, massive, ethereal, sharp, void_state;
    };

    Semantics getSemantics() {
        Semantics s;
        s.metal           = getLatent(0);
        s.wood            = getLatent(1);
        s.water           = getLatent(2);
        s.fire            = getLatent(3);
        s.earth           = getLatent(4);
        s.lightning       = getLatent(5);
        s.wind            = getLatent(6);
        s.ice             = getLatent(7);

        s.pure_qi         = getLatent(8);
        s.demonic_qi      = getLatent(9);
        s.blood_essence   = getLatent(10);
        s.sword_intent    = getLatent(11);
        s.golden_core     = getLatent(12);
        s.spiritual_sense = getLatent(13);
        s.yin_yang        = getLatent(14);
        s.chaos_tear      = getLatent(15);

        s.rising          = getLatent(16);
        s.sinking         = getLatent(17);
        s.expanding       = getLatent(18);
        s.contracting     = getLatent(19);
        s.spiraling       = getLatent(20);
        s.exploding       = getLatent(21);
        s.still           = getLatent(22);
        s.flowing         = getLatent(23);

        s.jade            = getLatent(24);
        s.iron            = getLatent(25);
        s.mist            = getLatent(26);
        s.fractal_array   = getLatent(27);
        s.massive         = getLatent(28);
        s.ethereal        = getLatent(29);
        s.sharp           = getLatent(30);
        s.void_state      = getLatent(31);
        return s;
    }

    vec4 evaluateProceduralHarmonics(vec3 p, float time) {
        vec3 col = vec3(0.0);
        float displacement = 0.0;
        vec3 cur_p = p;
        
        int evalLimit = u_dim;
        // Map 0.0 (Max FPS) to 1.0 (HD)
        // At HD: cap at 256 for performance/stuttering reasons
        // At Max FPS: cap at 64
        int maxHarmonics = int(mix(64.0, 256.0, u_quality));
        if (evalLimit > maxHarmonics) {
            evalLimit = maxHarmonics;
        }
        
        if (u_mode == 2 && evalLimit > 64) {
            evalLimit = 64;
        }
        
        const int MAX_DIM = 2048; 
        
        for (int i = 0; i < MAX_DIM; i++) {
            if (i >= u_dim || i >= evalLimit) break;
            
            float latentValue = getLatent(i);
            float fi = float(i);
            vec3 randParams = hash3(fi); 
            
            float freq = 1.0 + randParams.x * 3.0;
            float phase = randParams.y * 6.28;
            
            float harmonic = sin(dot(cur_p, normalize(randParams - 0.5)) * freq + phase);
            float influence = latentValue * harmonic;
            
            if (u_mode == 2) { 
                displacement += influence * 0.02;
                col += vec3(0.5 + 0.5 * sin(fi * 0.1), 0.5 + 0.5 * cos(fi * 0.2), randParams.z) * abs(influence) * 0.02;
            } 
            else { 
                displacement += influence * 0.003;
                col += randParams * abs(influence) * 0.005;
                cur_p.xy *= rot(latentValue * harmonic * 0.001);
            }
        }
        
        return vec4(col, displacement * u_interference);
    }

    float mapMode1(vec3 p, Semantics s) {
        vec3 cur_p = p;
        float time = u_time;

        if (s.yin_yang > 0.1) {
            cur_p.x = abs(cur_p.x);
            cur_p.z = mix(cur_p.z, abs(cur_p.z), s.yin_yang * 0.5);
            cur_p.xz *= rot(cur_p.y * s.yin_yang);
        }

        // Development
        float rising = max(0.0, s.rising);
        float sinking = max(0.0, s.sinking);
        cur_p.y -= rising * 0.3;
        cur_p.y += sinking * 0.3;
        
        float flowing = max(0.0, s.flowing);
        cur_p.x += sin(cur_p.z * 2.0) * flowing * 0.3;
        cur_p.z += cos(cur_p.x * 2.0) * flowing * 0.3;
        
        float spiraling = max(0.0, s.spiraling);
        cur_p.xz *= rot(cur_p.y * spiraling * 1.5);
        
        float expanding = max(0.0, s.expanding);
        float contracting = max(0.0, s.contracting);
        float exploding = max(0.0, s.exploding);
        
        float scale = 1.0 + expanding * 0.5 - contracting * 0.5 + exploding * 0.3;
        cur_p /= max(0.1, scale);

        // Core Forms
        float massive = max(0.0, s.massive);
        float baseRadius = 1.2 + massive * 0.8;
        
        float d_sphere = length(cur_p) - baseRadius;
        
        vec3 q = abs(cur_p) - vec3(baseRadius * 0.7);
        float d_box = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
        
        float shapeChoice = clamp(max(0.0, s.sharp) - max(0.0, s.golden_core), 0.0, 1.0);
        float d = mix(d_sphere, d_box, shapeChoice);

        // Void (Hollowing)
        float void_state = max(0.0, s.void_state);
        if (void_state > 0.1) {
            float inner = length(cur_p) - baseRadius * 0.6;
            d = max(d, -inner * void_state);
        }
        
        // Fractal Array (Formations)
        float fractal_array = max(0.0, s.fractal_array);
        if (fractal_array > 0.05) {
            vec3 fp = cur_p;
            float f_scale = 1.0;
            for(int i=0; i<3; i++) {
                fp = abs(fp) - 0.5 * f_scale;
                fp.xz *= rot(1.0);
                fp.yz *= rot(0.5);
                f_scale *= 0.5;
            }
            d += (length(fp) - 0.1) * fractal_array * 0.5;
        }

        // Elemental Displacements
        float wood = max(0.0, s.wood);
        d += sin(cur_p.x * 5.0 + cur_p.y * 3.0) * sin(cur_p.z * 5.0) * wood * 0.15;
        
        float water = max(0.0, s.water);
        d -= sin(cur_p.x * 3.0) * sin(cur_p.z * 3.0) * water * 0.15;

        float earth = max(0.0, s.earth);
        d += (hash(cur_p.x * 10.0 + cur_p.y * 10.0) * 0.5 - 0.25) * earth * 0.2;

        float demonic_qi = max(0.0, s.demonic_qi);
        d += sin(cur_p.x * 10.0) * sin(cur_p.y * 10.0) * sin(cur_p.z * 10.0) * demonic_qi * 0.15;

        float wind = max(0.0, s.wind);
        d += sin(length(cur_p.xz) * 15.0) * wind * 0.05;

        float sword_intent = max(0.0, s.sword_intent);
        d -= abs(sin(cur_p.x + cur_p.y + cur_p.z) * 10.0) * sword_intent * 0.05;

        float chaos_tear = max(0.0, s.chaos_tear);
        d += (hash(cur_p.y * 50.0) - 0.5) * chaos_tear * 0.1;

        d *= max(0.1, scale);
        
        // Dampen with still
        float still = clamp(s.still, 0.0, 1.0);
        d = mix(d, length(p) - baseRadius, still * 0.5);
        
        return d * 0.6; // Improved raymarching stability factor
    }

    float map(vec3 p, Semantics s) {
        if (u_mode == 1) {
            return mapMode1(p, s);
        } else {
            float d = length(p) - 1.2; 
            if (d < 0.8) { // Only evaluate expensive harmonics near the surface
                vec4 field = evaluateProceduralHarmonics(p, u_time);
                d += field.w;
            }
            return mix(d * 0.7, d * 0.5, u_quality);
        }
    }

    vec3 getNormal(vec3 p, Semantics s) {
        vec2 e = mix(vec2(0.04, 0.0), vec2(0.02, 0.0), u_quality);
        return normalize(vec3(
            map(p + e.xyy, s) - map(p - e.xyy, s),
            map(p + e.yxy, s) - map(p - e.yxy, s),
            map(p + e.yyx, s) - map(p - e.yyx, s)
        ));
    }

    vec4 getColorMode1(vec3 p, vec3 n, vec3 rd, float t_dist, Semantics s) {
        vec3 col = vec3(0.0);
        float time = u_time;
        
        // Base materials mapping
        vec3 matCol = vec3(0.05); // base void
        
        // Elements
        matCol = mix(matCol, vec3(0.8, 0.8, 0.9), clamp(s.metal, 0.0, 1.0));
        matCol = mix(matCol, vec3(0.2, 0.5, 0.2), clamp(s.wood, 0.0, 1.0));
        matCol = mix(matCol, vec3(0.1, 0.3, 0.8), clamp(s.water, 0.0, 1.0));
        matCol = mix(matCol, vec3(0.8, 0.2, 0.1), clamp(s.fire, 0.0, 1.0));
        matCol = mix(matCol, vec3(0.5, 0.4, 0.2), clamp(s.earth, 0.0, 1.0));
        matCol = mix(matCol, vec3(0.6, 0.9, 1.0), clamp(s.ice, 0.0, 1.0));
        
        matCol = mix(matCol, vec3(0.4, 0.8, 0.5), clamp(s.jade, 0.0, 1.0));
        matCol = mix(matCol, vec3(0.15, 0.15, 0.2), clamp(s.iron, 0.0, 1.0));

        vec3 l = normalize(vec3(1.0, 1.0, -1.0));
        float diff = max(dot(n, l), 0.0);
        
        // Specular & Rim
        float specPower = 16.0 + max(0.0, s.metal) * 64.0 + max(0.0, s.ice) * 32.0;
        float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), specPower);
        
        float rimPower = 3.0 - clamp(s.ethereal + s.spiritual_sense, 0.0, 2.0);
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), max(0.1, rimPower));
        
        col = matCol * diff * 1.5 + vec3(1.0) * spec + matCol * rim * 2.0;
        
        // Emission & Auras
        vec3 glow = vec3(0.0);
        glow += vec3(0.6, 0.9, 1.0) * max(0.0, s.pure_qi) * 1.5;
        glow += vec3(1.0, 0.0, 0.1) * max(0.0, s.blood_essence) * 1.2;
        glow += vec3(1.0, 0.8, 0.1) * max(0.0, s.golden_core) * 2.0;
        glow += vec3(0.4, 0.0, 0.7) * max(0.0, s.demonic_qi) * 1.2;
        glow += vec3(0.8, 0.6, 1.0) * max(0.0, s.lightning) * 2.0;
        glow += vec3(0.9, 0.9, 1.0) * max(0.0, s.sword_intent) * 1.5;
        glow += vec3(0.1, 0.8, 0.3) * max(0.0, s.spiritual_sense) * fract(length(p) * 2.0);
        glow += vec3(0.8, 0.1, 0.1) * max(0.0, s.chaos_tear) * hash(p.y * 100.0);
        
        col += glow;
        return vec4(col, 1.0);
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= u_resolution.x / u_resolution.y;
        
        Semantics s = getSemantics();

        vec3 ro = vec3(0.0, 0.0, 3.5);
        vec3 rd = normalize(vec3(p, -1.0));
        
        // Removed time-based camera rotation to prevent unprompted movement
        
        float d = 0.0;
        float t_dist = 0.0;
        
        int steps = int(mix(30.0, 45.0, u_quality));
        float d_thresh = mix(0.015, 0.005, u_quality);
        
        for (int i = 0; i < 45; i++) {
            if (i >= steps) break;
            vec3 pos = ro + rd * t_dist;
            d = map(pos, s);
            if (abs(d) < d_thresh || t_dist > 8.0) break;
            t_dist += d; 
        }
        
        vec3 bg = vec3(0.01, 0.02, 0.04) * (1.0 - length(p)*0.5);
        vec3 color = bg;
        
        if (t_dist < 8.0) {
            vec3 pos = ro + rd * t_dist;
            vec3 n = getNormal(pos, s);
            
            if (u_mode == 1) {
                color = getColorMode1(pos, n, rd, t_dist, s).rgb;
            } else {
                vec3 l = normalize(vec3(1.0, 1.0, -1.0));
                vec4 field = evaluateProceduralHarmonics(pos, u_time);
                vec3 matCol = vec3(0.02) + abs(field.xyz) * 2.0; 
                float diff = max(dot(n, l), 0.0);
                float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 32.0);
                float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
                
                color = matCol * diff * 1.5 + vec3(1.0) * spec + matCol * rim * 2.0;
                color += field.xyz * 3.0; 
            }
        }
        
        if (u_mode == 1) {
            float fogFactor = clamp(s.mist + s.wind + s.ethereal, 0.0, 1.0);
            vec3 mistColor = mix(bg, vec3(0.8, 0.9, 1.0), clamp(s.mist, 0.0, 1.0) * 0.5);
            mistColor = mix(mistColor, vec3(0.2, 0.0, 0.3), clamp(s.demonic_qi, 0.0, 1.0) * 0.5); 
            color = mix(color, mistColor, smoothstep(2.0, 7.0 - fogFactor*3.0, t_dist));
        } else {
            color = mix(color, bg, smoothstep(2.0, 7.0, t_dist));
        }

        color = color / (1.0 + color);
        color = pow(color, vec3(1.0/2.2));
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

export class NeuroEngine {
    private gl: WebGLRenderingContext;
    private program: WebGLProgram;
    private texture: WebGLTexture;
    private animFrame: number = 0;
    private startTime: number = 0;
    
    private uRes: WebGLUniformLocation | null = null;
    private uTime: WebGLUniformLocation | null = null;
    private uLatent: WebGLUniformLocation | null = null;
    private uInt: WebGLUniformLocation | null = null;
    private uMode: WebGLUniformLocation | null = null;
    private uDim: WebGLUniformLocation | null = null;
    private uQuality: WebGLUniformLocation | null = null;

    private autoQuality: boolean = true;
    private currentQuality: number = 0.5;
    private avgFrameTime: number = 16.6;
    private hasFloatTexture: boolean = false;
    public isPaused: boolean = false;

    constructor(private canvas: HTMLCanvasElement) {
        const gl = canvas.getContext('webgl');
        if (!gl) throw new Error("WebGL not supported");
        this.gl = gl;
        
        if (this.gl.getExtension('OES_texture_float')) {
            this.hasFloatTexture = true;
        }

        this.program = this.initShader();
        this.initGeometry();
        this.texture = this.initTexture();
        this.getUniforms();
    }

    private compileShader(type: number, source: string) {
        const s = this.gl.createShader(type)!;
        this.gl.shaderSource(s, source);
        this.gl.compileShader(s);
        if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(s));
            this.gl.deleteShader(s);
        }
        return s;
    }

    private initShader() {
        const vs = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource)!;
        const fs = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource)!;
        const prog = this.gl.createProgram()!;
        this.gl.attachShader(prog, vs);
        this.gl.attachShader(prog, fs);
        this.gl.linkProgram(prog);
        this.gl.useProgram(prog);
        return prog;
    }

    private initGeometry() {
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const posBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        const posLoc = this.gl.getAttribLocation(this.program, "position");
        this.gl.enableVertexAttribArray(posLoc);
        this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
    }

    private initTexture() {
        const tex = this.gl.createTexture()!;
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        return tex;
    }

    private getUniforms() {
        this.uRes = this.gl.getUniformLocation(this.program, "u_resolution");
        this.uTime = this.gl.getUniformLocation(this.program, "u_time");
        this.uInt = this.gl.getUniformLocation(this.program, "u_interference");
        this.uLatent = this.gl.getUniformLocation(this.program, "u_latentData");
        this.uMode = this.gl.getUniformLocation(this.program, "u_mode");
        this.uDim = this.gl.getUniformLocation(this.program, "u_dim");
        this.uQuality = this.gl.getUniformLocation(this.program, "u_quality");
    }

    public setAutoQuality(enabled: boolean) {
        this.autoQuality = enabled;
        if (!enabled) this.currentQuality = 1.0; 
    }

    public setMode(mode: number) {
        this.gl.useProgram(this.program);
        this.gl.uniform1i(this.uMode, mode);
    }

    public setLatentVector(vector: Float32Array) {
        const dim = vector.length;
        this.gl.useProgram(this.program);
        this.gl.uniform1i(this.uDim, dim);

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        
        if (this.hasFloatTexture) {
            const data = new Float32Array(32 * 32 * 4);
            for (let i = 0; i < dim; i++) {
                data[i * 4] = (vector[i] + 2.0) / 4.0;
                data[i * 4 + 3] = 1.0;
            }
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 32, 32, 0, this.gl.RGBA, this.gl.FLOAT, data);
        } else {
            const data = new Uint8Array(32 * 32 * 4);
            for (let i = 0; i < dim; i++) {
                const val = Math.max(0, Math.min(255, Math.floor(((vector[i] + 2.0) / 4.0) * 255)));
                data[i * 4] = val;     // R
                data[i * 4 + 1] = 0;   // G
                data[i * 4 + 2] = 0;   // B
                data[i * 4 + 3] = 255; // A
            }
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 32, 32, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, data);
        }
    }

    public start() {
        this.startTime = performance.now();
        let lastFrameTime = performance.now();

        const loop = () => {
            if (this.isPaused) {
                this.animFrame = requestAnimationFrame(loop);
                return;
            }

            const now = performance.now();
            const delta = now - lastFrameTime;
            lastFrameTime = now;

            if (this.autoQuality) {
                this.avgFrameTime = this.avgFrameTime * 0.95 + delta * 0.05;
                const targetFrameTime = 1000 / 45; // target 45 FPS
                
                if (this.avgFrameTime > targetFrameTime) {
                    this.currentQuality = Math.max(0.0, this.currentQuality - 0.05);
                } else if (this.avgFrameTime < 1000 / 55) {
                    this.currentQuality = Math.min(1.0, this.currentQuality + 0.01);
                }
            } else {
                this.currentQuality = 1.0;
            }

            const baseRatio = window.devicePixelRatio || 1;
            const PIXEL_RATIO = this.autoQuality ? baseRatio * (0.3 + 0.7 * this.currentQuality) : baseRatio;

            const targetWidth = Math.floor(window.innerWidth * PIXEL_RATIO);
            const targetHeight = Math.floor(window.innerHeight * PIXEL_RATIO);

            if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
                this.canvas.width = targetWidth;
                this.canvas.height = targetHeight;
                // Force CSS width/height to fill screen regardless of internal canvas resolution
                this.canvas.style.width = window.innerWidth + 'px';
                this.canvas.style.height = window.innerHeight + 'px';
                
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                this.gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
            }

            InputService.getInstance().update();

            let bleInterference = BleService.getInstance().synapticPersistence;
            let inputInterference = InputService.getInstance().synapticPersistence;

            // Neuro-interface gives MORE advantages (bonus multiplier or higher cap), but fallback to alternative inputs
            let interference = Math.min(1.0, bleInterference + inputInterference);
            
            // if disconnected from both, default to 1.0 (chill mode), otherwise dynamic
            let isActive = BleService.getInstance().isConnected || inputInterference > 0.01;
            let uIntVal = isActive ? 0.3 + (interference * 3.0) : 1.0;

            this.gl.uniform1f(this.uTime, (performance.now() - this.startTime) / 1000.0);
            this.gl.uniform1i(this.uLatent, 0);
            this.gl.uniform1f(this.uInt, uIntVal); 
            this.gl.uniform1f(this.uQuality, this.currentQuality);

            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
            this.animFrame = requestAnimationFrame(loop);
        };
        loop();
    }

    public stop() {
        cancelAnimationFrame(this.animFrame);
    }

    public destroy() {
        this.stop();
        if (this.gl) {
            this.gl.deleteTexture(this.texture);
            this.gl.deleteProgram(this.program);
            const ext = this.gl.getExtension('WEBGL_lose_context');
            if (ext) {
                ext.loseContext();
            }
        }
    }

    public setPaused(paused: boolean) {
        this.isPaused = paused;
    }
}
