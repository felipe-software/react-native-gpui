import { accessSync, chmodSync, constants, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAIN_PACKAGE = "@felipe-software/react-native-gpui";
export const SERVICE_NAME = "rngpui-service";
export const UI_RUNTIME_NAME = "ui-runtime.js";
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PLATFORMS = {
    "linux-x64": { os: "linux", cpu: "x64", libc: "glibc" },
    "linux-arm64": { os: "linux", cpu: "arm64", libc: "glibc" },
    "darwin-arm64": { os: "darwin", cpu: "arm64" },
};

export function platformKey(platform = process.platform, arch = process.arch) {
    return `${platform}-${arch}`;
}

export function platformPackageName(key = platformKey()) {
    return `${MAIN_PACKAGE}-${key}`;
}

export function isRepoCheckout(root = packageRoot) {
    return existsSync(resolve(root, "..", "rust", "Cargo.toml"));
}

export function resolveServiceBinary({ env = process.env, root = packageRoot } = {}) {
    const found = findServiceBinary(env, root);
    if (found.source !== "RNGPUI_SERVICE") ensureExecutable(found.path);
    return found;
}

export function uiRuntimeEnv(binary, { env = process.env, root = packageRoot } = {}) {
    if (env.RNGPUI_UI_BUNDLE) return {};
    if (existsSync(join(dirname(binary), UI_RUNTIME_NAME))) return {};
    const packaged = join(root, "dist", UI_RUNTIME_NAME);
    return existsSync(packaged) ? { RNGPUI_UI_BUNDLE: packaged } : {};
}

function findServiceBinary(env, root) {
    if (env.RNGPUI_SERVICE) {
        const explicit = resolve(env.RNGPUI_SERVICE);
        if (!existsSync(explicit)) throw new Error(`RNGPUI_SERVICE points at ${explicit}, which does not exist`);
        return { path: explicit, source: "RNGPUI_SERVICE" };
    }
    const packaged = platformPackageBinary(root);
    if (packaged) return packaged;
    const local = localBinaries(root).find((candidate) => existsSync(candidate.path));
    if (local) return local;
    throw new Error(missingBinaryMessage(root));
}

function platformPackageBinary(root) {
    const name = platformPackageName();
    try {
        const manifest = createRequire(join(root, "package.json")).resolve(`${name}/package.json`);
        const path = join(dirname(manifest), SERVICE_NAME);
        return existsSync(path) ? { path, source: name } : null;
    } catch {
        return null;
    }
}

function localBinaries(root) {
    const native = { path: join(root, "native", SERVICE_NAME), source: "native/" };
    if (!isRepoCheckout(root)) return [native];
    const target = resolve(root, "..", "rust", "target");
    const release = { path: join(target, "release", SERVICE_NAME), source: "rust/target/release" };
    const debug = { path: join(target, "debug", SERVICE_NAME), source: "rust/target/debug" };
    const newestFirst = [native, release].sort((a, b) => modifiedAt(b.path) - modifiedAt(a.path));
    return [...newestFirst, debug];
}

function modifiedAt(path) {
    try {
        return statSync(path).mtimeMs;
    } catch {
        return 0;
    }
}

function missingBinaryMessage(root) {
    const key = platformKey();
    const supported = Object.keys(PLATFORMS).join(", ");
    if (!PLATFORMS[key]) {
        return `${MAIN_PACKAGE} has no prebuilt ${SERVICE_NAME} for ${key} (prebuilt: ${supported}). Build it from source and set RNGPUI_SERVICE.`;
    }
    const repoHint = isRepoCheckout(root) ? " or run `npm run build:rust && npm run build:native` in ts/" : "";
    return `${SERVICE_NAME} not found: ${platformPackageName(key)} is not installed. It is an optional dependency of ${MAIN_PACKAGE}; reinstall without --omit=optional / --no-optional, set RNGPUI_SERVICE${repoHint}.`;
}

function ensureExecutable(path) {
    try {
        accessSync(path, constants.X_OK);
    } catch {
        chmodSync(path, 0o755);
    }
}
