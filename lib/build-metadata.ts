import "server-only";

import { readFileSync } from "node:fs";

type ReadFile = (path: string) => Buffer;

export const BUILD_DEPLOYMENT_ID_FILE = "/app/.sunrise-build-deployment-id";

export function readBuildDeploymentId(readFile: ReadFile = readFileSync) {
  try {
    const deploymentId = readFile(BUILD_DEPLOYMENT_ID_FILE)
      .toString("utf8")
      .trim();
    if (!deploymentId) {
      throw new Error("embedded Sunrise deployment ID is empty");
    }
    return deploymentId;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read embedded Sunrise deployment ID: ${reason}`);
  }
}
