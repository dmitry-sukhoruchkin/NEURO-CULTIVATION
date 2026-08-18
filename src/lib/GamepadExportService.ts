export class GamepadExportService {
    private static instance: GamepadExportService | null = null;
    public ws: WebSocket | null = null;
    public isConnected = false;
    public isConnecting = false;
    public url = "ws://127.0.0.1:8080";

    private constructor() {}

    public static getInstance() {
        if (!GamepadExportService.instance) {
            GamepadExportService.instance = new GamepadExportService();
        }
        return GamepadExportService.instance;
    }

    public connect(url?: string) {
        if (url) this.url = url;
        if (this.ws || this.isConnecting) return;
        this.isConnecting = true;
        
        try {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = () => {
                this.isConnected = true;
                this.isConnecting = false;
            };
            this.ws.onclose = () => {
                this.isConnected = false;
                this.isConnecting = false;
                this.ws = null;
            };
            this.ws.onerror = () => {
                this.isConnected = false;
                this.isConnecting = false;
                this.ws = null;
            };
        } catch (e) {
            this.isConnected = false;
            this.isConnecting = false;
            this.ws = null;
        }
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }

    public sendState(axes: number[]) {
        if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ axes }));
        }
    }
}
