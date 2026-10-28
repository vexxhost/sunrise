import { spawn } from "node:child_process";
import type { Page } from "@playwright/test";
import { expect, test } from "../cloud/fixtures";

type ProcessOptions = {
  input?: string;
  timeoutMs?: number;
};

type PodState = {
  image: string;
  imageId: string;
  name: string;
  ready: boolean;
  uid: string;
};

type PodList = {
  items: Array<{
    metadata: {
      deletionTimestamp?: string;
      name: string;
      uid: string;
    };
    spec: {
      containers: Array<{ image: string; name: string }>;
    };
    status?: {
      conditions?: Array<{ status: string; type: string }>;
      containerStatuses?: Array<{ imageID?: string; name: string }>;
    };
  }>;
};

type PodSessionProbeResult = {
  sessionId: string | null;
  status: string | null;
  statusCode: number;
};

type Deployment = {
  spec: {
    replicas?: number;
    selector: {
      matchLabels: Record<string, string>;
    };
    strategy?: {
      rollingUpdate?: {
        maxSurge?: number | string;
        maxUnavailable?: number | string;
      };
      type?: string;
    };
  };
};

const kubeContext = process.env.SUNRISE_E2E_KIND_CONTEXT ?? "kind-sunrise";
const namespace = process.env.SUNRISE_E2E_KIND_NAMESPACE ?? "openstack";
const deploymentName = process.env.SUNRISE_E2E_KIND_DEPLOYMENT ?? "sunrise";
const containerName = process.env.SUNRISE_E2E_KIND_CONTAINER ?? "sunrise";
const affinityCookieName =
  process.env.SUNRISE_E2E_KIND_AFFINITY_COOKIE ?? "sunrise-affinity";
const targetImage = process.env.SUNRISE_E2E_KIND_IMAGE?.trim();

const podSessionProbe = [
  "const chunks = [];",
  'process.stdin.setEncoding("utf8");',
  'process.stdin.on("data", (chunk) => chunks.push(chunk));',
  'process.stdin.on("end", async () => {',
  "  try {",
  '    const cookie = Buffer.from(chunks.join(""), "base64").toString("utf8");',
  "    const host = process.argv[1];",
  "    const protocol = process.argv[2];",
  '    const response = await fetch("http://127.0.0.1:3000/auth/session/activity", {',
  '      redirect: "manual",',
  "      headers: {",
  '        accept: "application/json",',
  "        cookie,",
  "        host,",
  '        "x-forwarded-host": host,',
  '        "x-forwarded-proto": protocol,',
  "      },",
  "    });",
  "    const body = await response.json();",
  "    process.stdout.write(JSON.stringify({",
  '      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,',
  '      status: typeof body.status === "string" ? body.status : null,',
  "      statusCode: response.status,",
  "    }));",
  "  } catch (error) {",
  "    process.stderr.write(error instanceof Error ? error.message : String(error));",
  "    process.exitCode = 1;",
  "  }",
  "});",
].join("\n");

function runProcess(
  command: string,
  args: string[],
  { input = "", timeoutMs = 60_000 }: ProcessOptions = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    let timeout: NodeJS.Timeout;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() =>
        reject(
          new Error(
            command + " timed out after " + Math.round(timeoutMs / 1000) + "s",
          ),
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      finish(() => {
        const output = Buffer.concat(stdout).toString("utf8").trim();
        if (code === 0) {
          resolve(output);
          return;
        }
        const details = Buffer.concat(stderr).toString("utf8").trim();
        reject(
          new Error(
            command +
              " exited with code " +
              code +
              (details ? ": " + details : ""),
          ),
        );
      });
    });
    child.stdin.end(input);
  });
}

function kubectl(args: string[], options?: ProcessOptions) {
  return runProcess(
    "kubectl",
    ["--context", kubeContext, "-n", namespace, ...args],
    options,
  );
}

async function deployment() {
  return JSON.parse(
    await kubectl(["get", "deployment", deploymentName, "-o", "json"]),
  ) as Deployment;
}

async function pods(selector: string) {
  const list = JSON.parse(
    await kubectl(["get", "pods", "-l", selector, "-o", "json"]),
  ) as PodList;

  return list.items
    .filter(({ metadata }) => !metadata.deletionTimestamp)
    .map(({ metadata, spec, status }) => {
      const container = spec.containers.find(
        ({ name }) => name === containerName,
      );
      const containerStatus = status?.containerStatuses?.find(
        ({ name }) => name === containerName,
      );
      if (!container) {
        throw new Error(
          "Pod " +
            metadata.name +
            " does not contain container " +
            containerName,
        );
      }

      return {
        image: container.image,
        imageId: containerStatus?.imageID ?? "",
        name: metadata.name,
        ready: Boolean(
          status?.conditions?.some(
            ({ status: conditionStatus, type }) =>
              type === "Ready" && conditionStatus === "True",
          ),
        ),
        uid: metadata.uid,
      } satisfies PodState;
    });
}

async function assertSessionOnPods(
  podStates: PodState[],
  page: Page,
  baseURL: string,
) {
  const applicationUrl = new URL(baseURL);
  const cookies = await page.context().cookies(baseURL);
  const cookieHeader = cookies
    .map(({ name, value }) => name + "=" + value)
    .join("; ");
  expect(
    cookies.some(
      ({ name }) => name === "sunrise" || name.startsWith("sunrise."),
    ),
    "authenticated browser cookie",
  ).toBe(true);
  const encodedCookie = Buffer.from(cookieHeader).toString("base64");
  const sessionIds = new Set<string>();

  for (const pod of podStates) {
    const output = await kubectl(
      [
        "exec",
        "-i",
        pod.name,
        "-c",
        containerName,
        "--",
        "node",
        "-e",
        podSessionProbe,
        applicationUrl.host,
        applicationUrl.protocol.slice(0, -1),
      ],
      { input: encodedCookie },
    );
    const result = JSON.parse(output) as PodSessionProbeResult;
    expect(result, "session response from " + pod.name).toMatchObject({
      status: "active",
      statusCode: 200,
    });
    expect(result.sessionId, "session ID from " + pod.name).toEqual(
      expect.any(String),
    );
    if (!result.sessionId) {
      throw new Error("Pod " + pod.name + " returned an empty session ID");
    }
    sessionIds.add(result.sessionId);
  }

  expect(sessionIds.size, "shared session ID across all pods").toBe(1);
  const [sessionId] = sessionIds;
  if (!sessionId)
    throw new Error("No pod returned an authenticated session ID");
  return sessionId;
}

async function assertPublicSession(page: Page) {
  const readiness = await page.request.get("/readyz", {
    failOnStatusCode: false,
    timeout: 10_000,
  });
  expect(readiness.status(), "public readiness response").toBe(200);

  await page.goto("/compute/instances", {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Instances", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to Sunrise" }),
  ).toHaveCount(0);
}

test.use({ cloudReturnTo: "/compute/instances" });

test("an authenticated session survives replacement of every Sunrise replica", async ({
  baseURL,
  page,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");

  const activeDeployment = await deployment();
  const selector = Object.entries(activeDeployment.spec.selector.matchLabels)
    .map(([key, value]) => key + "=" + value)
    .join(",");
  expect(selector, "Deployment pod selector").not.toBe("");
  const desiredReplicas = activeDeployment.spec.replicas ?? 0;
  expect(desiredReplicas, "Sunrise replica count").toBeGreaterThanOrEqual(2);
  expect(activeDeployment.spec.strategy?.type).toBe("RollingUpdate");
  expect(
    [0, "0", "0%"],
    "maxUnavailable must preserve public availability",
  ).toContain(
    activeDeployment.spec.strategy?.rollingUpdate?.maxUnavailable ?? 0,
  );
  expect(
    [0, "0", "0%"],
    "maxSurge must let a replacement become ready before termination",
  ).not.toContain(activeDeployment.spec.strategy?.rollingUpdate?.maxSurge);

  await assertPublicSession(page);
  const affinityCookie = (await page.context().cookies(baseURL)).find(
    ({ name }) => name === affinityCookieName,
  );
  expect(
    affinityCookie,
    "ingress affinity cookie " + affinityCookieName,
  ).toEqual(
    expect.objectContaining({
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: true,
    }),
  );
  const previousPods = await pods(selector);
  expect(previousPods).toHaveLength(desiredReplicas);
  expect(previousPods.every(({ ready }) => ready)).toBe(true);
  const authenticatedSessionId = await assertSessionOnPods(
    previousPods,
    page,
    baseURL,
  );

  const currentImage = previousPods[0]?.image;
  let rolloutStarted = false;
  let rolloutComplete = false;
  let rolloutError: unknown;
  let stopProbing = false;
  let publicProbesDuringRollout = 0;
  let probingError: unknown;
  const probing = (async () => {
    do {
      await assertPublicSession(page);
      if (rolloutStarted && !rolloutComplete) {
        publicProbesDuringRollout += 1;
      }
      if (!stopProbing) await page.waitForTimeout(250);
    } while (!stopProbing);
  })().catch((error: unknown) => {
    probingError = error;
  });

  try {
    if (targetImage && targetImage !== currentImage) {
      await kubectl([
        "set",
        "image",
        "deployment/" + deploymentName,
        containerName + "=" + targetImage,
      ]);
    } else {
      await kubectl(["rollout", "restart", "deployment/" + deploymentName]);
    }
    rolloutStarted = true;
    await kubectl(
      ["rollout", "status", "deployment/" + deploymentName, "--timeout=240s"],
      { timeoutMs: 250_000 },
    );
  } catch (error: unknown) {
    rolloutError = error;
  } finally {
    rolloutComplete = true;
    stopProbing = true;
    await probing;
  }
  if (rolloutError) throw rolloutError;
  if (probingError) throw probingError;
  expect(
    publicProbesDuringRollout,
    "public probes completed while rollout was in progress",
  ).toBeGreaterThan(0);

  const replacementPods = await pods(selector);
  const previousUids = new Set(previousPods.map(({ uid }) => uid));
  expect(replacementPods).toHaveLength(desiredReplicas);
  expect(replacementPods.every(({ ready }) => ready)).toBe(true);
  expect(
    replacementPods.every(({ uid }) => !previousUids.has(uid)),
    "every old pod must be replaced",
  ).toBe(true);
  if (targetImage) {
    expect(
      replacementPods.every(({ image }) => image === targetImage),
      "every replacement must use the requested image",
    ).toBe(true);
  }
  expect(replacementPods.every(({ imageId }) => imageId)).toBe(true);

  expect(
    await assertSessionOnPods(replacementPods, page, baseURL),
    "shared session ID after rollout",
  ).toBe(authenticatedSessionId);
  await assertPublicSession(page);
  const replacementAffinityCookie = (
    await page.context().cookies(baseURL)
  ).find(({ name }) => name === affinityCookieName);
  expect(
    replacementAffinityCookie,
    "ingress affinity cookie after rollout",
  ).toEqual(
    expect.objectContaining({
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      secure: true,
    }),
  );
  expect(replacementAffinityCookie?.value).toBeTruthy();
});
