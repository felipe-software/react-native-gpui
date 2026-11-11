import { sendHostCommand } from "./runtime";

export type WindowFrame = {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
};

export type WindowFrameUpdate = {
    width?: number;
    height?: number;
    maximized?: boolean;
};

let current: WindowFrame | null = null;
const listeners = new Set<(frame: WindowFrame) => void>();

export function _setWindowFrame(frame: WindowFrame): void {
    const same =
        current !== null &&
        current.x === frame.x &&
        current.y === frame.y &&
        current.width === frame.width &&
        current.height === frame.height &&
        current.maximized === frame.maximized;
    if (same) return;
    current = frame;
    for (const listener of [...listeners]) listener(frame);
}

export const MainWindow = {
    getFrame(): WindowFrame | null {
        return current;
    },
    addFrameListener(listener: (frame: WindowFrame) => void): { remove(): void } {
        listeners.add(listener);
        return {
            remove() {
                listeners.delete(listener);
            },
        };
    },
    setFrame(update: WindowFrameUpdate): void {
        sendHostCommand({ $cmd: "windowFrame", ...update });
    },
};
