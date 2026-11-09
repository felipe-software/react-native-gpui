#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
    MAIN_PACKAGE,
    PLATFORMS,
    SERVICE_NAME,
    UI_RUNTIME_NAME,
    packageRoot,
    platformKey,
    platformPackageName,
} from "./service-binary.mjs";

const manifestPath = join(packageRoot, "package.json");
const entitlements = resolve(packageRoot, "..", "rust", "jsc.entitlements");
const repositoryUrl = "git+https://github.com/felipe-software/react-native-gpui.git";
const homepage = "https://github.com/felipe-software/react-native-gpui#readme";
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const [command, ...rest] = process.argv.slice(2);
const options = parseOptions(rest);

if (command === "set-version") {
    const version = requireVersion(options.positional[0]);
    writeManifest(releaseManifest(readManifest(), version));
    console.log(`[npm-packages] ${MAIN_PACKAGE}@${version} with ${Object.keys(PLATFORMS).length} platform optionalDependencies`);
} else if (command === "stage-platform") {
    const version = requireVersion(options.version ?? readManifest().version);
    console.log(stagePlatform(version, options.out));
} else if (command === "pack") {
    const out = resolve(options.out ?? join(packageRoot, "npm", "packs"));
    packAll(requireVersion(options.version ?? readManifest().version), out);
} else {
    console.error("usage: node scripts/npm-packages.mjs set-version <version>");
    console.error("       node scripts/npm-packages.mjs stage-platform [--version <v>] [--out <dir>]");
    console.error("       node scripts/npm-packages.mjs pack [--version <v>] [--out <dir>]");
    process.exit(1);
}

function parseOptions(args) {
    const parsed = { positional: [] };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--out") parsed.out = args[++i];
        else if (arg === "--version") parsed.version = args[++i];
        else parsed.positional.push(arg);
    }
    return parsed;
}

function requireVersion(value) {
    const version = String(value ?? "").replace(/^v/, "");
    if (!VERSION_PATTERN.test(version)) {
        console.error(`[npm-packages] not a release version: ${value}`);
        process.exit(1);
    }
    return version;
}

function readManifest() {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function writeManifest(manifest) {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
}

function releaseManifest(manifest, version) {
    const optionalDependencies = Object.fromEntries(Object.keys(PLATFORMS).map((key) => [platformPackageName(key), version]));
    return { ...manifest, version, optionalDependencies };
}

function stagePlatform(version, outDir) {
    const key = platformKey();
    const platform = PLATFORMS[key];
    if (!platform) throw new Error(`no npm platform package is defined for ${key}`);
    const nativeDir = join(packageRoot, "native");
    const service = join(nativeDir, SERVICE_NAME);
    const uiRuntime = join(packageRoot, "dist", UI_RUNTIME_NAME);
    if (!existsSync(service)) throw new Error(`${service} is missing; run npm run build:rust && npm run build:native`);
    if (!existsSync(uiRuntime)) throw new Error(`${uiRuntime} is missing; run bun scripts/build-ui-runtime.mjs`);

    const dir = resolve(outDir ?? join(packageRoot, "npm", key));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    stage(service, join(dir, SERVICE_NAME));
    stage(uiRuntime, join(dir, UI_RUNTIME_NAME));
    stripDebugInfo(dir, [SERVICE_NAME]);
    copyFileSync(join(packageRoot, "LICENSE"), join(dir, "LICENSE"));
    writeFileSync(join(dir, "README.md"), platformReadme(key));
    writeFileSync(join(dir, "package.json"), `${JSON.stringify(platformManifest(key, platform, version), null, 4)}\n`);
    return dir;
}

function platformManifest(key, platform, version) {
    const libc = platform.libc ? { libc: [platform.libc] } : {};
    return {
        name: platformPackageName(key),
        version,
        description: `The ${key} rngpui-service binary for ${MAIN_PACKAGE}.`,
        license: "MIT",
        repository: { type: "git", url: repositoryUrl },
        homepage,
        os: [platform.os],
        cpu: [platform.cpu],
        ...libc,
        preferUnplugged: true,
    };
}

function platformReadme(key) {
    return [
        `# ${platformPackageName(key)}`,
        "",
        `The \`${SERVICE_NAME}\` binary of [${MAIN_PACKAGE}](https://www.npmjs.com/package/${MAIN_PACKAGE}) for ${key},`,
        "with the worklet runtime beside it.",
        "",
        `Do not install this package directly: \`${MAIN_PACKAGE}\` lists it as an optional dependency and`,
        "your package manager installs the one that matches your platform.",
        "",
    ].join("\n");
}

function stripDebugInfo(dir, names) {
    const paths = names.map((name) => join(dir, name));
    if (process.platform === "linux") {
        execFileSync("strip", ["--strip-debug", ...paths], { stdio: "inherit" });
        return;
    }
    if (process.platform === "darwin") {
        execFileSync("strip", ["-S", ...paths], { stdio: "inherit" });
        for (const path of paths.slice(1)) execFileSync("codesign", ["--force", "--sign", "-", path], { stdio: "inherit" });
        execFileSync("codesign", ["--force", "--sign", "-", "--entitlements", entitlements, paths[0]], { stdio: "inherit" });
    }
}

function stage(source, target) {
    const temp = `${target}.staging`;
    copyFileSync(source, temp);
    renameSync(temp, target);
}

function packAll(version, out) {
    mkdirSync(out, { recursive: true });
    const platformDir = stagePlatform(version);
    const platformTarball = npmPack(platformDir, out);
    const original = readFileSync(manifestPath, "utf8");
    let mainTarball;
    try {
        writeManifest(releaseManifest(JSON.parse(original), version));
        mainTarball = npmPack(packageRoot, out);
    } finally {
        writeFileSync(manifestPath, original);
    }
    for (const tarball of [mainTarball, platformTarball]) {
        console.log(`${tarball.path}  ${formatBytes(tarball.size)} packed, ${formatBytes(tarball.unpackedSize)} unpacked, ${tarball.entryCount} files`);
    }
}

function npmPack(dir, out) {
    const output = execFileSync("npm", ["pack", "--json", "--pack-destination", out], { cwd: dir, encoding: "utf8" });
    const [result] = JSON.parse(output);
    return { ...result, path: join(out, result.filename) };
}

function formatBytes(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
