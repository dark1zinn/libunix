export interface LifecycleParticipant {
    close(): Promise<void>;
    disposeSync?(): void;
}

let refCount = 0;
let listenersAttached = false;
const participants = new Set<LifecycleParticipant>();

let shuttingDown = false;

function onSignal(): void {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    const snapshot = [...participants];
    void Promise.all(snapshot.map((p) => p.close())).finally(() => {
        shuttingDown = false;
    });
}

function onExit(): void {
    for (const participant of participants) {
        participant.disposeSync?.();
    }
}

function attachSignalListeners(): void {
    if (listenersAttached) {
        return;
    }
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('exit', onExit);
    listenersAttached = true;
}

function detachSignalListeners(): void {
    if (!listenersAttached) {
        return;
    }
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    process.off('exit', onExit);
    listenersAttached = false;
}

export function registerLifecycle(participant: LifecycleParticipant): void {
    participants.add(participant);
    refCount += 1;
    attachSignalListeners();
}

export function unregisterLifecycle(participant: LifecycleParticipant): void {
    participants.delete(participant);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
        detachSignalListeners();
    }
}

/** @internal Test helper */
export function lifecycleDebugState(): {
    refCount: number;
    listenersAttached: boolean;
    participantCount: number;
} {
    return {
        refCount,
        listenersAttached,
        participantCount: participants.size,
    };
}
