/**
 * OAuth PKCE browser-based login flow for Cognite Data Fusion.
 *
 * Opens the user's browser to authenticate via auth.cognite.com,
 * receives the callback on a local HTTPS server, and exchanges
 * the authorization code for an access token.
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import https from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";
import { openBrowser } from "./browser";

const LOGIN_CONFIG = {
  authority: "https://auth.cognite.com",
  clientId: "0404baaa-0a90-43a2-aba7-a110b53fb41c",
  redirectUri: "https://localhost:3000/",
  port: 3000,
  loginTimeout: 300_000,
  certDir: join(homedir(), ".cdf-login"),
};

export interface LoginOptions {
  org?: string;
}

// --- PKCE helpers ---

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(bytes = 32): string {
  return base64Url(crypto.randomBytes(bytes));
}

function pkceChallenge(verifier: string): string {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

// --- HTTP helpers ---

interface OpenIdConfiguration {
  authorization_endpoint?: string;
  token_endpoint?: string;
}

interface TokenResponse {
  access_token?: string;
  [key: string]: unknown;
}

async function fetchJson(url: string, options?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, options);
  const text = await response.text();

  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const message = (data.error_description ||
      data.error ||
      data.message ||
      response.statusText) as string;
    throw new Error(`${url} failed with ${response.status}: ${message}`);
  }

  return data;
}

async function discoverOpenIdConfiguration(authority: string): Promise<OpenIdConfiguration> {
  const url = new URL("/.well-known/openid-configuration", authority);
  return fetchJson(url.toString()) as Promise<OpenIdConfiguration>;
}

// --- Certificates ---

function getOrCreateCertificates(certDir: string): { key: Buffer; cert: Buffer } {
  const keyPath = join(certDir, "localhost-key.pem");
  const certPath = join(certDir, "localhost-cert.pem");

  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }

  process.stderr.write("Generating self-signed certificate for HTTPS callback...\n");
  mkdirSync(certDir, { recursive: true });

  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-sha256",
        "-subj",
        "/CN=localhost",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        "365",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    throw new Error("Failed to generate self-signed certificate. Install OpenSSL and retry.");
  }

  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

// --- Authorization URL ---

function buildAuthorizationUrl(
  config: typeof LOGIN_CONFIG,
  discovery: OpenIdConfiguration,
  verifier: string,
  state: string,
  org?: string,
): string {
  if (!discovery.authorization_endpoint) {
    throw new Error("OpenID discovery document is missing authorization_endpoint");
  }

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  if (org) {
    url.searchParams.set("organization_hint", org);
  }

  return url.toString();
}

// --- Token exchange ---

async function exchangeCodeForTokens(
  discovery: OpenIdConfiguration,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  if (!discovery.token_endpoint) {
    throw new Error("OpenID discovery document is missing token_endpoint");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: LOGIN_CONFIG.clientId,
    code,
    redirect_uri: LOGIN_CONFIG.redirectUri,
    code_verifier: verifier,
  });

  return fetchJson(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }) as Promise<TokenResponse>;
}

// --- Callback HTML ---

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function callbackHtml(title: string, message: string): string {
  return `<html><body style="font-family:system-ui;padding:40px;text-align:center">
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
}

// --- Callback server ---

function startCallbackServer(
  tlsOptions: { key: Buffer; cert: Buffer },
  discovery: OpenIdConfiguration,
  verifier: string,
  expectedState: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Login timeout — no response received within 5 minutes"));
    }, LOGIN_CONFIG.loginTimeout);

    const server = https.createServer(tlsOptions, async (req, res) => {
      const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);

      if (url.pathname !== "/") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        const desc = url.searchParams.get("error_description") || error;
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(callbackHtml("Authentication error", desc));
        clearTimeout(timeout);
        server.close();
        reject(new Error(desc));
        return;
      }

      const state = url.searchParams.get("state");
      if (state !== expectedState) {
        const msg = "Invalid OAuth state";
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(callbackHtml("Authentication error", msg));
        clearTimeout(timeout);
        server.close();
        reject(new Error(msg));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        const msg = "No authorization code returned";
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(callbackHtml("Authentication error", msg));
        clearTimeout(timeout);
        server.close();
        reject(new Error(msg));
        return;
      }

      try {
        const tokens = await exchangeCodeForTokens(discovery, code, verifier);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          callbackHtml("Login successful", "You can close this window and return to the terminal."),
        );
        clearTimeout(timeout);
        server.close();

        if (!tokens.access_token) {
          reject(new Error("No access_token in token response"));
          return;
        }
        resolve(tokens.access_token);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(callbackHtml("Authentication error", msg));
        clearTimeout(timeout);
        server.close();
        reject(err instanceof Error ? err : new Error(msg));
      }
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${LOGIN_CONFIG.port} is already in use`));
        return;
      }
      reject(err);
    });

    server.listen(LOGIN_CONFIG.port, "127.0.0.1", () => {
      process.stderr.write(
        `Local HTTPS server listening on https://localhost:${LOGIN_CONFIG.port}\n`,
      );
    });
  });
}

// --- Public API ---

/**
 * Perform interactive browser-based OAuth login against Cognite auth.
 * Returns the access_token string.
 */
export async function browserLogin(options?: LoginOptions): Promise<string> {
  const verifier = randomBase64Url(64);
  const state = randomBase64Url(32);

  process.stderr.write("Fetching OpenID configuration...\n");
  const discovery = await discoverOpenIdConfiguration(LOGIN_CONFIG.authority);

  const authUrl = buildAuthorizationUrl(LOGIN_CONFIG, discovery, verifier, state, options?.org);
  const tlsOptions = getOrCreateCertificates(LOGIN_CONFIG.certDir);

  process.stderr.write("Opening browser for authentication...\n");
  try {
    await openBrowser(authUrl);
  } catch {
    process.stderr.write(
      `Could not open browser automatically.\nOpen this URL manually:\n${authUrl}\n`,
    );
  }

  return startCallbackServer(tlsOptions, discovery, verifier, state);
}
