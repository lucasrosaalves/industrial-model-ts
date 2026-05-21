/**
 * Authentication prompts for Cognite Data Fusion.
 */

import { input, password, select } from "@inquirer/prompts";
import { browserLogin } from "../auth/login";
import { extractAuthFromToken } from "../auth/token";

export interface AuthOptions {
  token?: string;
  project?: string;
  baseUrl?: string;
}

export async function promptAuth(flags: AuthOptions): Promise<{
  token: string;
  project: string;
  baseUrl: string;
}> {
  let token: string;

  if (flags.token) {
    token = flags.token;
  } else {
    const method = await select({
      message: "How do you want to authenticate?",
      choices: [
        { value: "browser", name: "Browser login (recommended)" },
        { value: "token", name: "Paste token manually" },
      ],
    });

    if (method === "browser") {
      const org = await input({
        message: "Organization hint (leave empty to skip):",
      });
      token = await browserLogin(org ? { org } : undefined);
    } else {
      token = await password({ message: "CDF bearer token:" });
    }
  }

  // Try to extract project and base URL from JWT claims
  const extracted = extractAuthFromToken(token);

  const project =
    flags.project ||
    (await input({
      message: "CDF project name:",
      ...(extracted.project ? { default: extracted.project } : {}),
    }));

  const baseUrl =
    flags.baseUrl ||
    (await input({
      message: "CDF base URL:",
      default: extracted.baseUrl || "https://az-eastus-1.cognitedata.com",
    }));

  return { token, project, baseUrl };
}
