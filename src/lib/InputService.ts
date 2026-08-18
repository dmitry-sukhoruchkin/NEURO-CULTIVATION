export class InputService {
    private static instance: InputService | null = null;

    public synapticPersistence: number = 0;
    public rawAxes: Float32Array = new Float32Array(16);

    public useGamepad: boolean = true;
    public useKeyboardMouse: boolean = true;
    public useSensors: boolean = true;
    public multiDeviceMode: 'append' | 'average' | 'max' | 'primary' = 'max';

    private orientation = { alpha: 0, beta: 0, gamma: 0 };
    private acceleration = { x: 0, y: 0, z: 0 };
    public hasSensors: boolean = false;
    private baselineAlpha: number | null = null;

    private keys: Record<string, boolean> = {};
    private mouseMoveX: number = 0;
    private mouseMoveY: number = 0;
    private mouseWheel: number = 0;
    private mouseBtnL: boolean = false;
    private mouseBtnR: boolean = false;
    private mouseBtnM: boolean = false;

    // Web Serial Dongle Integration (0ms Latency BCI Channel)
    public isSerialConnected = false;
    public isSerialActive = false;
    private serialPort: any = null;
    private serialReader: any = null;

    private constructor() {
        this.initSensors();
        this.initPeripherals();
    }

    public static getInstance() {
        if (!InputService.instance) {
            InputService.instance = new InputService();
        }
        return InputService.instance;
    }

    public async connectSerial() {
        if (!('serial' in navigator)) {
            alert("Web Serial is not supported in this browser. Use Chrome, Edge or Opera.");
            return;
        }
        try {
            this.serialPort = await (navigator as any).serial.requestPort();
            await this.serialPort.open({ baudRate: 115200 });
            this.isSerialConnected = true;
            this.readSerialLoop();
        } catch (e) {
            console.error("Web Serial connection failed", e);
        }
    }

    public async disconnectSerial() {
        this.isSerialActive = false;
        if (this.serialReader) {
            try {
                await this.serialReader.cancel();
            } catch (e) {}
            this.serialReader = null;
        }
        if (this.serialPort) {
            try {
                await this.serialPort.close();
            } catch (e) {}
            this.serialPort = null;
        }
        this.isSerialConnected = false;
    }

    private async readSerialLoop() {
        const reader = this.serialPort.readable.getReader();
        this.serialReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split("\n");
                buffer = lines.pop() || "";
                
                for (let line of lines) {
                    line = line.trim();
                    if (line.startsWith("S:")) {
                        const parts = line.substring(2).split(",");
                        if (parts.length === 3) {
                            const vx = parseFloat(parts[0]);
                            const vy = parseFloat(parts[1]);
                            const tq = parseFloat(parts[2]);
                            
                            if (!isNaN(vx) && !isNaN(vy) && !isNaN(tq)) {
                                // Прямой маппинг в лабиринт без просадок и задержек
                                this.rawAxes[0] = vx / 15.0;
                                this.rawAxes[1] = vy / 15.0;
                                this.rawAxes[2] = tq / 2.0;
                                this.isSerialActive = true;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Serial read error", e);
        } finally {
            reader.releaseLock();
            this.isSerialConnected = false;
            this.isSerialActive = false;
        }
    }

    private initPeripherals() {
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => this.keys[e.code] = true);
            window.addEventListener('keyup', (e) => this.keys[e.code] = false);
            
            window.addEventListener('mousedown', (e) => {
                if (e.button === 0) this.mouseBtnL = true;
                if (e.button === 1) this.mouseBtnM = true;
                if (e.button === 2) this.mouseBtnR = true;
            });
            window.addEventListener('mouseup', (e) => {
                if (e.button === 0) this.mouseBtnL = false;
                if (e.button === 1) this.mouseBtnM = false;
                if (e.button === 2) this.mouseBtnR = false;
            });
            window.addEventListener('mousemove', (e) => {
                if (document.pointerLockElement) {
                    this.mouseMoveX += e.movementX;
                    this.mouseMoveY += e.movementY;
                }
            });
            window.addEventListener('wheel', (e) => {
                this.mouseWheel += Math.sign(e.deltaY);
            });
            
            document.addEventListener('keydown', (e) => {
                if (e.code === 'ControlLeft') {
                    if (document.pointerLockElement) {
                        document.exitPointerLock();
                    } else {
                        document.body.requestPointerLock();
                    }
                }
            });
        }
    }

    public initSensors() {
        if (typeof window !== 'undefined') {
            window.addEventListener('deviceorientation', (e) => {
                if (e.alpha !== null || e.beta !== null || e.gamma !== null) {
                    this.hasSensors = true;
                    this.orientation.alpha = e.alpha || 0;
                    this.orientation.beta = e.beta || 0;
                    this.orientation.gamma = e.gamma || 0;
                }
            });

            window.addEventListener('devicemotion', (e) => {
                if (e.acceleration && (e.acceleration.x !== null || e.acceleration.y !== null || e.acceleration.z !== null)) {
                    this.hasSensors = true;
                    this.acceleration.x = e.acceleration.x || 0;
                    this.acceleration.y = e.acceleration.y || 0;
                    this.acceleration.z = e.acceleration.z || 0;
                }
            });
        }
    }

    public requestSensorAccess() {
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            (DeviceOrientationEvent as any).requestPermission()
                .then((permissionState: string) => {
                    if (permissionState === 'granted') {
                        this.initSensors();
                    }
                })
                .catch(console.error);
        }
    }

    private deadzone(val: number): number {
        return val;
    }

    public mouseDeltaX: number = 0;
    public mouseDeltaY: number = 0;

    public getActiveDevices() {
        let devices: { id: string, axes: number[] }[] = [];
        
        if (this.useKeyboardMouse && !this.isSerialActive) {
            let kAxes = new Array(6).fill(0);
            kAxes[0] = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
            kAxes[1] = (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0);
            kAxes[2] = (this.keys['ArrowRight'] ? 1 : 0) - (this.keys['ArrowLeft'] ? 1 : 0) + this.mouseDeltaX * 0.05;
            kAxes[3] = (this.keys['ArrowDown'] ? 1 : 0) - (this.keys['ArrowUp'] ? 1 : 0) + this.mouseDeltaY * 0.05;
            kAxes[4] = (this.keys['KeyE'] ? 1 : 0) - (this.keys['KeyQ'] ? 1 : 0) + this.mouseWheel * 0.5;
            kAxes[5] = (this.keys['Space'] ? 1 : 0) - (this.keys['ShiftLeft'] ? 1 : 0) + (this.mouseBtnR ? 1 : 0) - (this.mouseBtnL ? 1 : 0);
            devices.push({ id: "Keyboard/Mouse", axes: kAxes });
        }

        if (this.useGamepad && !this.isSerialActive) {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (gp) {
                    let gAxes = new Array(6).fill(0);
                    gAxes[0] = this.deadzone(gp.axes[0] || 0); // LX
                    gAxes[1] = this.deadzone(gp.axes[1] || 0); // LY
                    gAxes[2] = this.deadzone(gp.axes[2] || 0); // RX
                    gAxes[3] = this.deadzone(gp.axes[3] || 0); // RY
                    gAxes[4] = (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0); // Triggers
                    gAxes[5] = (gp.buttons[5]?.pressed ? 1 : 0) - (gp.buttons[4]?.pressed ? 1 : 0); // Bumpers
                    devices.push({ id: `Gamepad ${gp.index}`, axes: gAxes });
                }
            }
        }
        
        return devices;
    }

    public getMultiDeviceAxes(): Float32Array {
        let allAxes = new Float32Array(16);
        let devices = this.getActiveDevices();
        
        if (devices.length === 0) {
            return allAxes;
        }

        if (this.multiDeviceMode === 'average' || this.multiDeviceMode === 'max' || this.multiDeviceMode === 'primary') {
            if (this.multiDeviceMode === 'primary') {
                for (let i = 0; i < devices[0].axes.length && i < 16; i++) {
                    allAxes[i] = devices[0].axes[i] || 0;
                }
            } else if (this.multiDeviceMode === 'average') {
                let counts = new Array(16).fill(0);
                for (let dev of devices) {
                    for (let i = 0; i < dev.axes.length; i++) {
                        if (i < 16) {
                            allAxes[i] += dev.axes[i] || 0;
                            counts[i]++;
                        }
                    }
                }
                for (let i = 0; i < 16; i++) {
                    if (counts[i] > 0) {
                        allAxes[i] /= counts[i];
                    }
                }
            } else if (this.multiDeviceMode === 'max') {
                for (let dev of devices) {
                    for (let i = 0; i < dev.axes.length; i++) {
                        if (i < 16) {
                            let val = dev.axes[i] || 0;
                            if (Math.abs(val) > Math.abs(allAxes[i])) {
                                allAxes[i] = val;
                            }
                        }
                    }
                }
            }

            for (let i = 0; i < 16; i++) {
                allAxes[i] = Math.max(-1.0, Math.min(1.0, allAxes[i]));
            }
            // Add keyboard aux
            if (this.useKeyboardMouse && !this.isSerialActive) {
                allAxes[6] = Math.max(-1.0, Math.min(1.0, allAxes[6] + (this.keys['Digit2'] ? 1 : 0) - (this.keys['Digit1'] ? 1 : 0)));
                allAxes[7] = Math.max(-1.0, Math.min(1.0, allAxes[7] + (this.keys['Digit4'] ? 1 : 0) - (this.keys['Digit3'] ? 1 : 0)));
            }
        } else {
            let axisIndex = 0;
            for (let dev of devices) {
                for (let i = 0; i < dev.axes.length; i++) {
                    if (axisIndex < 16) {
                        allAxes[axisIndex++] = dev.axes[i] || 0;
                    }
                }
            }
            
            // Also map keyboard specific bindings (Aux mappings 6-9) if space is available
            if (this.useKeyboardMouse && !this.isSerialActive && axisIndex < 16) {
                allAxes[6] = Math.max(-1.0, Math.min(1.0, allAxes[6] + (this.keys['Digit2'] ? 1 : 0) - (this.keys['Digit1'] ? 1 : 0)));
                allAxes[7] = Math.max(-1.0, Math.min(1.0, allAxes[7] + (this.keys['Digit4'] ? 1 : 0) - (this.keys['Digit3'] ? 1 : 0)));
            }
        }
        
        return allAxes;
    }

    public update() {
        // Если активен потоковый USB Serial, мы не затираем и не перезаписываем оси 0, 1, 2
        const startIdx = this.isSerialActive ? 3 : 0;
        for(let i = startIdx; i < 16; i++) this.rawAxes[i] = 0;

        this.mouseDeltaX = this.mouseMoveX;
        this.mouseDeltaY = this.mouseMoveY;

        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let gpActive = false;

        if (this.useGamepad && !this.isSerialActive) {
            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (gp) {
                    gpActive = true;
                    
                    this.rawAxes[0] = this.deadzone(gp.axes[0] || 0); // L-X
                    this.rawAxes[1] = this.deadzone(gp.axes[1] || 0); // L-Y
                    this.rawAxes[2] = this.deadzone(gp.axes[2] || 0); // R-X
                    this.rawAxes[3] = this.deadzone(gp.axes[3] || 0); // R-Y
    
                    let trigL = gp.buttons[6]?.value || 0;
                    let trigR = gp.buttons[7]?.value || 0;
                    this.rawAxes[4] = trigR - trigL; // Triggers
    
                    let bumpL = gp.buttons[4]?.pressed ? 1 : 0;
                    let bumpR = gp.buttons[5]?.pressed ? 1 : 0;
                    this.rawAxes[5] = bumpR - bumpL; // Bumpers
    
                    let btnA = gp.buttons[0]?.pressed ? 1 : 0;
                    let btnB = gp.buttons[1]?.pressed ? 1 : 0;
                    let btnX = gp.buttons[2]?.pressed ? 1 : 0;
                    let btnY = gp.buttons[3]?.pressed ? 1 : 0;
                    
                    this.rawAxes[6] = btnB - btnX; 
                    this.rawAxes[7] = btnY - btnA; 
    
                    let dpadU = gp.buttons[12]?.pressed ? 1 : 0;
                    let dpadD = gp.buttons[13]?.pressed ? 1 : 0;
                    let dpadL = gp.buttons[14]?.pressed ? 1 : 0;
                    let dpadR = gp.buttons[15]?.pressed ? 1 : 0;
                    this.rawAxes[8] = dpadR - dpadL;
                    this.rawAxes[9] = dpadU - dpadD;
    
                    break;
                }
            }
        }

        if (this.useKeyboardMouse && !this.isSerialActive) {
            // 0: Base Pan (A/D)
            this.rawAxes[0] = Math.max(-1.0, Math.min(1.0, this.rawAxes[0] + (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0)));
            // 1: Shoulder (W/S)
            this.rawAxes[1] = Math.max(-1.0, Math.min(1.0, this.rawAxes[1] + (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0)));
            
            // 2: Wrist Pitch (Arrow L/R) + Mouse X
            this.rawAxes[2] = Math.max(-1.0, Math.min(1.0, this.rawAxes[2] + (this.keys['ArrowRight'] ? 1 : 0) - (this.keys['ArrowLeft'] ? 1 : 0) + this.mouseMoveX * 0.05));
            // 3: Elbow Pitch (Arrow U/D) + Mouse Y
            this.rawAxes[3] = Math.max(-1.0, Math.min(1.0, this.rawAxes[3] + (this.keys['ArrowDown'] ? 1 : 0) - (this.keys['ArrowUp'] ? 1 : 0) + this.mouseMoveY * 0.05));
            this.mouseMoveX = 0; 
            this.mouseMoveY = 0;

            // 4: Wrist Roll (Q/E) + Wheel
            this.rawAxes[4] = Math.max(-1.0, Math.min(1.0, this.rawAxes[4] + (this.keys['KeyE'] ? 1 : 0) - (this.keys['KeyQ'] ? 1 : 0) + this.mouseWheel * 0.5));
            this.mouseWheel *= 0.5;
            if (Math.abs(this.mouseWheel) < 0.01) this.mouseWheel = 0;

            // 5: Gripper (Space/Shift) + Mouse Buttons
            this.rawAxes[5] = Math.max(-1.0, Math.min(1.0, this.rawAxes[5] + (this.keys['Space'] ? 1 : 0) - (this.keys['ShiftLeft'] ? 1 : 0) + (this.mouseBtnR ? 1 : 0) - (this.mouseBtnL ? 1 : 0)));
            
            // 6-9: Aux/D-pad mappings for other semantic features (Digits 1-4)
            this.rawAxes[6] = Math.max(-1.0, Math.min(1.0, this.rawAxes[6] + (this.keys['Digit2'] ? 1 : 0) - (this.keys['Digit1'] ? 1 : 0)));
            this.rawAxes[7] = Math.max(-1.0, Math.min(1.0, this.rawAxes[7] + (this.keys['Digit4'] ? 1 : 0) - (this.keys['Digit3'] ? 1 : 0)));
        }

        let currentFlow = 0;
        for(let i = 0; i < 16; i++) {
            this.rawAxes[i] = Math.max(-1.0, Math.min(1.0, this.rawAxes[i]));
            currentFlow += Math.abs(this.rawAxes[i]) * 0.1;
        }

        if (currentFlow > 0.02) {
            this.synapticPersistence = Math.min(1.0, this.synapticPersistence + currentFlow * 0.08);
        } else {
            this.synapticPersistence *= 0.98;
        }
    }
}