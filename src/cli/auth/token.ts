/**
 * JWT token decode utility (no signature verification).
 * Used to extract project and cluster URL from Cognite access tokens.
 */

export interface TokenClaims {
  projects?: string[];
  aud?: string;
  [key: string]: unknown;
}

export function decodeTokenClaims(token: string): TokenClaims {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return {};

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as TokenClaims;
  } catch {
    return {};
  }
}

/**
 * Attempt to extract project and base URL from a Cognite JWT.
 */
export function extractAuthFromToken(token: string): {
  project: string | undefined;
  baseUrl: string | undefined;
} {
  const claims = decodeTokenClaims(token);

  const project = claims.projects?.[0];

  // aud is typically the cluster URL, e.g. "https://az-eastus-1.cognitedata.com"
  let baseUrl: string | undefined;
  if (typeof claims.aud === "string" && claims.aud.startsWith("https://")) {
    baseUrl = claims.aud;
  }

  return { project, baseUrl };
}
