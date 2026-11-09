import { createElement, useMemo, useRef, type ReactElement } from "react";
import { sendCommand } from "./commands";
import { createHostCommandId } from "./components";
import { registerNativeComponent, type NativeComponentConfig, type NativePropKind } from "./reconciler";

export type { NativeComponentConfig, NativePropKind };

export type NativeComponentProps<P> = P & { nativeElementId?: number };

export type NativeComponent<P> = ((props: NativeComponentProps<P>) => ReactElement) & {
    readonly type: string;
};

export type NativeElementHandle = {
    readonly id: number;
    send(name: string, args?: Record<string, unknown>): void;
};

export function defineNativeComponent<P extends object>(config: NativeComponentConfig): NativeComponent<P> {
    const hostType = registerNativeComponent(config);
    function NativeHost({ nativeElementId, ...props }: NativeComponentProps<P>) {
        return createElement(hostType, { ...props, __rngpuiHostId: nativeElementId });
    }
    NativeHost.displayName = `Native(${config.type})`;
    return Object.assign(NativeHost, { type: config.type });
}

export function sendNativeCommand(type: string, id: number, name: string, args?: Record<string, unknown>) {
    sendCommand({ $cmd: "nativeCommand", type, id, name, args });
}

export function useNativeElement(type: string): NativeElementHandle {
    const idRef = useRef<number | null>(null);
    if (idRef.current == null) idRef.current = createHostCommandId();
    const id = idRef.current;
    return useMemo(
        () => ({
            id,
            send(name: string, args?: Record<string, unknown>) {
                sendNativeCommand(type, id, name, args);
            },
        }),
        [type, id],
    );
}
