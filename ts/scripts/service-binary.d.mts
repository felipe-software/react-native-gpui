export type ServiceBinary = {
    path: string;
    source: string;
};

export type ServiceBinaryOptions = {
    env?: Record<string, string | undefined>;
    root?: string;
};

export type PlatformTarget = {
    os: string;
    cpu: string;
    libc?: string;
};

export declare const MAIN_PACKAGE: string;
export declare const SERVICE_NAME: string;
export declare const UI_RUNTIME_NAME: string;
export declare const packageRoot: string;
export declare const PLATFORMS: Record<string, PlatformTarget>;

export declare function platformKey(platform?: string, arch?: string): string;
export declare function platformPackageName(key?: string): string;
export declare function isRepoCheckout(root?: string): boolean;
export declare function resolveServiceBinary(options?: ServiceBinaryOptions): ServiceBinary;
export declare function uiRuntimeEnv(binary: string, options?: ServiceBinaryOptions): { RNGPUI_UI_BUNDLE?: string };
