/**
 * Authentication prompts for Cognite Data Fusion.
 */

import { input, password } from "@inquirer/prompts";

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
  const token =
    flags.token ||
    (await password({
      message: "CDF bearer token:",
    }));

  const project =
    flags.project ||
    (await input({
      message: "CDF project name:",
    }));

  const baseUrl =
    flags.baseUrl ||
    (await input({
      message: "CDF base URL:",
      default: "https://az-eastus-1.cognitedata.com",
    }));

  return { token, project, baseUrl };
}
