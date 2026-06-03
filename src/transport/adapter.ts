export interface TransportSocket {
    readonly handleId: string;
}

export interface TransportListenHandle {
    close(closeActiveConnections?: boolean): void;
}

export interface TransportSocketHandlers {
    onOpen?: (socket: TransportSocket) => void;
    onData: (socket: TransportSocket, chunk: Uint8Array) => void;
    onClose?: (socket: TransportSocket, error?: Error) => void;
    onError?: (socket: TransportSocket, error: Error) => void;
}

export type ProbeConnectResult = 'alive' | 'refused';

export interface TransportAdapter {
    listen(path: string, handlers: TransportSocketHandlers): TransportListenHandle;

    connect(path: string, handlers: TransportSocketHandlers): Promise<TransportSocket>;

    /**
     * Short-lived connect attempt for socket file hygiene (§4.1).
     */
    probeConnect(path: string, timeoutMs?: number): Promise<ProbeConnectResult>;

    write(socket: TransportSocket, data: Uint8Array): void;

    close(socket: TransportSocket): Promise<void>;
}
