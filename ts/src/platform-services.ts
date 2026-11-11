declare global {
    var __rngpui_platformRequest: ((op: string, args: unknown) => Promise<unknown>) | undefined;
    var __rngpui_storageInfo: { persistent: boolean; path: string | null } | undefined;
}

export function platformRequest<T>(op: string, args: unknown): Promise<T> {
    const send = globalThis.__rngpui_platformRequest;
    if (typeof send !== "function") {
        return Promise.reject(new Error("the native platform host is not available"));
    }
    return send(op, args) as Promise<T>;
}

function hasPlatformHost(): boolean {
    return typeof globalThis.__rngpui_platformRequest === "function";
}

export type NotificationOptions = {
    title: string;
    body?: string;
};

export const Notifications = {
    isAvailable(): boolean {
        return hasPlatformHost();
    },
    show(options: NotificationOptions): Promise<boolean> {
        const title = options?.title;
        if (typeof title !== "string" || title.trim() === "") {
            return Promise.reject(new TypeError("Notifications.show needs a non-empty title"));
        }
        const body = options.body == null ? "" : String(options.body);
        return platformRequest<boolean>("notifications.show", { title, body }).then((shown) => shown === true);
    },
};

export type SoundSource = "ping" | (string & {});

export type SoundOptions = {
    volume?: number;
};

export const Sound = {
    isAvailable(): boolean {
        return hasPlatformHost();
    },
    play(source: SoundSource = "ping", options: SoundOptions = {}): Promise<void> {
        const volume = options.volume;
        const validVolume = volume == null || (Number.isFinite(volume) && volume >= 0 && volume <= 1);
        if (!validVolume) {
            return Promise.reject(new RangeError(`Sound.play volume must be between 0 and 1, got ${volume}`));
        }
        return platformRequest<null>("sound.play", { source: String(source), volume: volume ?? null }).then(() => undefined);
    },
};

export const Processes = {
    isAvailable(): boolean {
        return hasPlatformHost();
    },
    findRunning(names: readonly string[]): Promise<string[]> {
        if (!Array.isArray(names)) {
            return Promise.reject(new TypeError("Processes.findRunning expects an array of process names"));
        }
        const wanted = names.filter((name): name is string => typeof name === "string" && name.trim() !== "");
        if (wanted.length === 0) return Promise.resolve([]);
        return platformRequest<string[]>("processes.findRunning", { names: wanted });
    },
};

export type KnownDirectories = {
    home: string | null;
    data: string | null;
    config: string | null;
};

export const Files = {
    isAvailable(): boolean {
        return hasPlatformHost();
    },
    readText(path: string): Promise<string | null> {
        if (typeof path !== "string" || path.trim() === "") {
            return Promise.reject(new TypeError("Files.readText needs a path"));
        }
        return platformRequest<string | null>("files.readText", { path });
    },
    knownDirectories(): Promise<KnownDirectories> {
        return platformRequest<KnownDirectories>("files.dirs", null);
    },
};

export const LocalStorage = {
    isPersistent(): boolean {
        return globalThis.__rngpui_storageInfo?.persistent === true;
    },
    getPath(): string | null {
        return globalThis.__rngpui_storageInfo?.path ?? null;
    },
    flush(): Promise<void> {
        if (!LocalStorage.isPersistent()) return Promise.resolve();
        return platformRequest<null>("storage.flush", null).then(() => undefined);
    },
};

export function getRandomValues<T extends ArrayBufferView>(array: T): T {
    return globalThis.crypto.getRandomValues(array);
}

export function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    return globalThis.crypto.randomUUID();
}
