use std::process::Command;

fn main() {
    let source_sha = std::env::var("RNGPUI_SOURCE_SHA").ok().or_else(|| {
        Command::new("git")
            .args(["rev-parse", "HEAD"])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|sha| sha.trim().to_string())
    });
    let source_sha = source_sha.unwrap_or_else(|| "unknown".to_string());
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "unknown".to_string());
    let target = std::env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=RNGPUI_SOURCE_SHA={source_sha}");
    println!(
        "cargo:rustc-env=RNGPUI_BUILD_ID={source_sha}:{}:{profile}:{target}",
        env!("CARGO_PKG_VERSION")
    );
    println!("cargo:rustc-env=RNGPUI_JSC_VERSION=system");
    println!("cargo:rerun-if-env-changed=RNGPUI_SOURCE_SHA");

    let head_ref = Command::new("git")
        .args(["symbolic-ref", "-q", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|reference| reference.trim().to_string())
        .unwrap_or_else(|| "HEAD".to_string());
    if let Some(git_head) = Command::new("git")
        .args(["rev-parse", "--git-path", &head_ref])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
    {
        println!("cargo:rerun-if-changed={}", git_head.trim());
    }

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let mut shim = cc::Build::new();
    shim.cpp(true).std("c++17").file("jsc_shim/jsc_shim.cpp");

    if target_os == "macos" {
        shim.compile("rng_jsc_shim");
        println!("cargo:rustc-link-lib=framework=JavaScriptCore");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path");
    } else {
        shim.file("jsc_shim/jsc_loader_linux.cpp");
        for dir in linux_jsc_include_dirs() {
            shim.include(dir);
        }
        shim.compile("rng_jsc_shim");
        println!("cargo:rustc-link-lib=dylib=dl");
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
        println!("cargo:rerun-if-changed=jsc_shim/jsc_loader_linux.cpp");
    }
    println!("cargo:rerun-if-changed=jsc_shim/jsc_shim.cpp");
    println!("cargo:rerun-if-changed=jsc_shim/jsc_shim.h");
}

const LINUX_JSC_PACKAGES: [&str; 3] = [
    "javascriptcoregtk-4.1",
    "javascriptcoregtk-6.0",
    "javascriptcoregtk-4.0",
];

fn linux_jsc_include_dirs() -> Vec<std::path::PathBuf> {
    println!("cargo:rerun-if-env-changed=RNGPUI_JSC_INCLUDE_DIR");
    if let Some(dir) = std::env::var_os("RNGPUI_JSC_INCLUDE_DIR") {
        return vec![dir.into()];
    }
    for package in LINUX_JSC_PACKAGES {
        if let Ok(library) = pkg_config::Config::new()
            .cargo_metadata(false)
            .env_metadata(false)
            .probe(package)
        {
            if has_jsc_header(&library.include_paths) {
                return library.include_paths;
            }
        }
    }
    let fallback: Vec<std::path::PathBuf> = LINUX_JSC_PACKAGES
        .iter()
        .map(|package| {
            format!(
                "/usr/include/{}",
                package.replace("javascriptcoregtk", "webkitgtk")
            )
            .into()
        })
        .collect();
    if let Some(dir) = fallback
        .iter()
        .find(|dir| dir.join("JavaScriptCore/JavaScript.h").exists())
    {
        return vec![dir.clone()];
    }
    panic!(
        "JavaScriptCore headers not found. Install the WebKitGTK JavaScriptCore development package \
         (Debian/Ubuntu: libjavascriptcoregtk-4.1-dev, Fedora: javascriptcoregtk4.1-devel, \
         Arch: webkit2gtk-4.1) or set RNGPUI_JSC_INCLUDE_DIR to the directory that contains \
         JavaScriptCore/JavaScript.h"
    );
}

fn has_jsc_header(dirs: &[std::path::PathBuf]) -> bool {
    dirs.iter()
        .any(|dir| dir.join("JavaScriptCore/JavaScript.h").exists())
}
