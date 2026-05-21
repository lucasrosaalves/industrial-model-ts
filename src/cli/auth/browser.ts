/**
 * Cross-platform browser opener utility.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env, platform } from "node:process";

function tryOpen(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(command, args, (error) => resolve(!error));
  });
}

function isWsl(): boolean {
  if (platform !== "linux") return false;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return true;

  try {
    const version = readFileSync("/proc/version", "utf8").toLowerCase();
    return version.includes("microsoft") || version.includes("wsl");
  } catch {
    return false;
  }
}

function wslDrivesMountPoint(): string {
  const defaultMount = "/mnt/";
  try {
    const config = readFileSync("/etc/wsl.conf", "utf8");
    const match = /(?:^|\n)\s*root\s*=\s*(?<mountPoint>[^\n#]+)/.exec(config);
    if (!match?.groups?.mountPoint) return defaultMount;
    const mp = match.groups.mountPoint.trim();
    return mp.endsWith("/") ? mp : `${mp}/`;
  } catch {
    return defaultMount;
  }
}

function powershellPath(): string {
  if (isWsl()) {
    return join(wslDrivesMountPoint(), "c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe");
  }
  const windowsRoot = env.SYSTEMROOT || env.windir || "C:\\Windows";
  return join(windowsRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
}

function powershellStartArgs(url: string): string[] {
  const encodedCommand = Buffer.from(`Start "${url}"`, "utf16le").toString("base64");
  return [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedCommand,
  ];
}

export async function openBrowser(url: string): Promise<void> {
  if (platform === "darwin") {
    if (await tryOpen("open", [url])) return;
  } else if (platform === "win32") {
    if (await tryOpen(powershellPath(), powershellStartArgs(url))) return;
    if (await tryOpen("cmd", ["/c", "start", "", url])) return;
  } else if (isWsl()) {
    if (await tryOpen(powershellPath(), powershellStartArgs(url))) return;
    if (await tryOpen("cmd.exe", ["/c", "start", "", url])) return;
    if (await tryOpen("wslview", [url])) return;
  } else {
    if (await tryOpen("xdg-open", [url])) return;
    if (await tryOpen("sensible-browser", [url])) return;
    if (await tryOpen("gio", ["open", url])) return;
    if (await tryOpen("python3", ["-m", "webbrowser", url])) return;
  }

  throw new Error("Could not open browser automatically");
}
