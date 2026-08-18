import { pipeline, env, FeatureExtractionPipeline } from '@huggingface/transformers';

// Suppress local models warning
env.allowLocalModels = false;

export class ClipService {
    private static instance: ClipService | null = null;
    private extractor: FeatureExtractionPipeline | null = null;
    private isInitializing = false;
    private initPromise: Promise<void> | null = null;

    private activeModel: string = 'Xenova/all-mpnet-base-v2';

    private isQuantized: boolean = true;
    public usedDevice: string = 'wasm';

    private constructor() {}

    public static getInstance(): ClipService {
        if (!ClipService.instance) {
            ClipService.instance = new ClipService();
        }
        return ClipService.instance;
    }

    public async checkIfCached(modelName: string, quantized: boolean): Promise<boolean> {
        if (!('caches' in self)) return false;
        try {
            const cache = await caches.open('transformers-cache');
            const keys = await cache.keys();
            const modelPath = modelName.replace('Xenova/', '');
            return keys.some(req => {
                if (!req.url.includes(modelPath)) return false;
                if (req.url.endsWith('.onnx')) {
                    const isQ = req.url.includes('_quantized');
                    return quantized ? isQ : !isQ;
                }
                return true;
            });
        } catch {
            return false;
        }
    }

    public async initialize(modelName: string, quantized: boolean, onProgress?: (progress: any) => void) {
        if (this.extractor && this.activeModel === modelName && this.isQuantized === quantized) return;
        
        // Reset if switching models
        if (this.extractor && (this.activeModel !== modelName || this.isQuantized !== quantized)) {
            this.extractor = null;
            this.initPromise = null;
            this.isInitializing = false;
        }

        this.activeModel = modelName;
        this.isQuantized = quantized;

        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise(async (resolve, reject) => {
            try {
                this.isInitializing = true;
                const deviceType = (navigator as any).gpu ? 'webgpu' : 'wasm';
                this.usedDevice = deviceType;
                console.log(`Initializing Transformers.js with device: ${deviceType}`);
                
                try {
                    this.extractor = await pipeline('feature-extraction', this.activeModel, {
                        progress_callback: onProgress,
                        dtype: this.isQuantized ? 'q8' : 'fp32',
                        device: deviceType as any
                    } as any);
                } catch(e) {
                    if (deviceType === 'webgpu') {
                        console.warn("WebGPU initialization failed, falling back to WASM");
                        this.usedDevice = 'wasm';
                        this.extractor = await pipeline('feature-extraction', this.activeModel, {
                            progress_callback: onProgress,
                            dtype: this.isQuantized ? 'q8' : 'fp32',
                            device: 'wasm' as any
                        } as any);
                    } else {
                        throw e;
                    }
                }
                this.isInitializing = false;
                resolve();
            } catch (err) {
                this.isInitializing = false;
                console.error("Failed to load CLIP model:", err);
                reject(err);
            }
        });
        return this.initPromise;
    }

    private idb: IDBDatabase | null = null;

    private async getDB(): Promise<IDBDatabase> {
        if (this.idb) return this.idb;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('embeddings-cache', 1);
            req.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('embeddings')) {
                    db.createObjectStore('embeddings');
                }
            };
            req.onsuccess = (e) => {
                this.idb = (e.target as IDBOpenDBRequest).result;
                resolve(this.idb);
            };
            req.onerror = () => reject(req.error);
        });
    }

    public async getEmbedding(text: string): Promise<Float32Array> {
        const cacheKey = `${this.activeModel}_${text}`;
        try {
            const db = await this.getDB();
            const cached = await new Promise<Float32Array | undefined>((resolve, reject) => {
                const tx = db.transaction('embeddings', 'readonly');
                const req = tx.objectStore('embeddings').get(cacheKey);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            if (cached) return cached;
        } catch (e) {
            console.warn("IndexedDB cache read error", e);
        }

        if (!this.extractor) {
            throw new Error("Extractor not initialized. Call initialize() first.");
        }

        const out = await this.extractor(text, { pooling: 'mean', normalize: true });
        const result = out.data as Float32Array;

        try {
            const db = await this.getDB();
            const tx = db.transaction('embeddings', 'readwrite');
            tx.objectStore('embeddings').put(result, cacheKey);
        } catch (e) {
            console.warn("IndexedDB cache write error", e);
        }

        return result;
    }
}
