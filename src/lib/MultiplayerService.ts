import Peer, { DataConnection } from 'peerjs';

export interface PlayerState {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number, number];
    color: string;
}

type Message = 
    | { type: 'state', state: PlayerState }
    | { type: 'join', color: string };

export class MultiplayerService {
    private static instance: MultiplayerService | null = null;
    
    public peer: Peer | null = null;
    public connections: Map<string, DataConnection> = new Map();
    public peerId: string | null = null;
    public isHost = false;
    
    public localColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    public remoteStates: Map<string, PlayerState> = new Map();

    private listeners: Set<() => void> = new Set();
    
    private constructor() {
        this.initPeer();
    }
    
    public static getInstance(): MultiplayerService {
        if (!MultiplayerService.instance) {
            MultiplayerService.instance = new MultiplayerService();
        }
        return MultiplayerService.instance;
    }
    
    private initPeer() {
        this.peer = new Peer();
        
        this.peer.on('open', (id) => {
            this.peerId = id;
            this.notify();
        });

        this.peer.on('connection', (conn) => {
            this.setupConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
        });
    }

    public async hostGame() {
        this.isHost = true;
        this.notify();
        return this.peerId;
    }

    public joinGame(hostId: string) {
        if (!this.peer) return;
        const conn = this.peer.connect(hostId);
        this.setupConnection(conn);
    }

    private setupConnection(conn: DataConnection) {
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            conn.send({ type: 'join', color: this.localColor });
            this.notify();
        });

        conn.on('data', (data: unknown) => {
            const msg = data as Message;
            if (msg.type === 'state') {
                this.remoteStates.set(msg.state.id, msg.state);
            } else if (msg.type === 'join') {
                console.log('Player joined:', conn.peer);
            }
        });

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            this.remoteStates.delete(conn.peer);
            this.notify();
        });
        
        conn.on('error', () => {
            this.connections.delete(conn.peer);
            this.remoteStates.delete(conn.peer);
            this.notify();
        });
    }

    public broadcastState(state: PlayerState) {
        const msg: Message = { type: 'state', state };
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    public subscribe(fn: () => void) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private notify() {
        this.listeners.forEach(fn => fn());
    }
}
