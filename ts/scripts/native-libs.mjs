export function isServiceLibrary(name, prefix = "libghostty-vt") {
    if (!name.startsWith(prefix)) return false;
    return process.platform === "darwin" ? name.endsWith(".dylib") : /\.so\.\d+$/.test(name);
}
