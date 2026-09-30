import { revalidatePath } from "next/cache";

import { guardMutationContext } from "@/lib/mutation-context";
import { mutationErrorForStatus } from "@/lib/mutations";
import { BARBICAN_PAYLOAD_LIMIT_BYTES } from "@/lib/openstack/barbican-input";
import {
  getServiceCatalog,
  resolveServiceEndpoint,
} from "@/lib/openstack/catalog";
import {
  BARBICAN_API_VERSION,
  BARBICAN_SERVICE,
  barbicanResourceId,
} from "@/lib/openstack/barbican-server";
import { parseBarbicanSecret } from "@/lib/openstack/barbican-schema";
import { serviceUrl } from "@/lib/openstack/request";
import { isSameOriginRequest } from "@/lib/request-origin";
import { getSession } from "@/lib/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function normalizedFilename(value: string) {
  const normalized = value
    .toWellFormed()
    .replace(/[\\/\r\n"\x00-\x1f]/g, "-")
    .trim();
  return Array.from(normalized || "barbican-secret").slice(0, 120).join("");
}

function encodeRfc5987(value: string) {
  return encodeURIComponent(value)
    .replace(/['()]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/\*/g, "%2A");
}

function contentDisposition(disposition: "attachment" | "inline", value: string) {
  const filename = normalizedFilename(value);
  const fallback = Array.from(filename, (character) =>
    /^[\x20-\x7e]$/.test(character) ? character : "_",
  ).join("");
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}

function requestId(response: Response) {
  return response.headers.get("x-openstack-request-id") ?? undefined;
}

type StreamingRequestInit = RequestInit & { duplex: "half" };

function mutationErrorResponse(
  status: number,
  action: string,
  response: Response,
) {
  const error = mutationErrorForStatus(status, action, requestId(response));
  return Response.json(
    { ok: false, error: error.message, requestId: error.requestId },
    { status },
  );
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  let secretId: string;
  try {
    secretId = barbicanResourceId(id, "secret ID");
  } catch {
    return Response.json({ error: "Invalid secret ID" }, { status: 400 });
  }

  const session = await getSession();
  if (!session.keystoneProjectToken || !session.regionId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const inline =
    new URL(request.url).searchParams.get("disposition") === "inline";
  if (
    inline &&
    (request.headers.get("x-sunrise-project-id") !== session.projectId ||
      request.headers.get("x-sunrise-region-id") !== session.regionId)
  ) {
    return Response.json(
      { error: "The active project or region changed. Reopen this secret." },
      { status: 409 },
    );
  }

  const catalog = await getServiceCatalog(session.keystoneProjectToken);
  const endpoint = catalog
    ? resolveServiceEndpoint(
        catalog,
        session.regionId,
        BARBICAN_SERVICE.serviceType,
        BARBICAN_SERVICE.serviceName,
      )
    : null;
  if (!endpoint) {
    return Response.json(
      { error: "Key Manager is unavailable" },
      { status: 404 },
    );
  }

  const headers = {
    "X-Auth-Token": session.keystoneProjectToken,
    "OpenStack-API-Version": BARBICAN_API_VERSION,
  };

  try {
    const metadataResponse = await fetch(
      serviceUrl(endpoint, `/v1/secrets/${secretId}`),
      { headers, cache: "no-store" },
    );
    if (!metadataResponse.ok) {
      return Response.json(
        {
          error: "The secret payload is unavailable.",
          requestId: requestId(metadataResponse),
        },
        { status: metadataResponse.status },
      );
    }
    const secret = parseBarbicanSecret(await metadataResponse.json());
    const contentType =
      secret.content_types.default ?? "application/octet-stream";
    const payloadResponse = await fetch(
      serviceUrl(endpoint, `/v1/secrets/${secretId}/payload`),
      {
        headers: { ...headers, Accept: contentType },
        cache: "no-store",
      },
    );
    if (!payloadResponse.ok) {
      return Response.json(
        {
          error: "The secret payload is unavailable.",
          requestId: requestId(payloadResponse),
        },
        { status: payloadResponse.status },
      );
    }

    const upstreamLength = Number(
      payloadResponse.headers.get("content-length"),
    );
    if (
      inline &&
      Number.isSafeInteger(upstreamLength) &&
      upstreamLength > BARBICAN_PAYLOAD_LIMIT_BYTES
    ) {
      return Response.json(
        {
          error:
            "This payload is too large to reveal safely. Download it instead.",
        },
        { status: 413 },
      );
    }

    const body = inline
      ? await payloadResponse.arrayBuffer()
      : payloadResponse.body;
    if (
      inline &&
      body instanceof ArrayBuffer &&
      body.byteLength > BARBICAN_PAYLOAD_LIMIT_BYTES
    ) {
      return Response.json(
        {
          error:
            "This payload is too large to reveal safely. Download it instead.",
        },
        { status: 413 },
      );
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": contentDisposition(
          inline ? "inline" : "attachment",
          secret.name ?? secret.id,
        ),
        "Content-Type": contentType,
        "Cross-Origin-Resource-Policy": "same-origin",
        Expires: "0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Key Manager could not be reached. Try again shortly." },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  if (
    !request.headers.get("origin") ||
    !isSameOriginRequest(request.headers, new URL(request.url).origin)
  ) {
    return Response.json(
      { ok: false, error: "Invalid request origin" },
      { status: 403 },
    );
  }

  const { id } = await params;
  let secretId: string;
  try {
    secretId = barbicanResourceId(id, "secret ID");
  } catch {
    return Response.json(
      { ok: false, error: "Invalid secret ID" },
      { status: 400 },
    );
  }

  const projectId = request.headers.get("x-sunrise-project-id") ?? "";
  const regionId = request.headers.get("x-sunrise-region-id") ?? "";
  const contentLength = Number(request.headers.get("content-length"));
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim();
  const contentEncoding = request.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();

  if (
    !request.body ||
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0
  ) {
    return Response.json(
      { ok: false, error: "Choose a non-empty payload to upload." },
      { status: 400 },
    );
  }
  if (contentLength > BARBICAN_PAYLOAD_LIMIT_BYTES) {
    return Response.json(
      {
        ok: false,
        error: `Payloads uploaded through Sunrise must be ${BARBICAN_PAYLOAD_LIMIT_BYTES.toLocaleString("en")} bytes or smaller.`,
      },
      { status: 413 },
    );
  }
  if (
    contentType !== "text/plain" &&
    contentType !== "application/octet-stream"
  ) {
    return Response.json(
      {
        ok: false,
        error: "Use text/plain or application/octet-stream payloads.",
      },
      { status: 415 },
    );
  }
  if (contentEncoding && contentEncoding !== "base64") {
    return Response.json(
      { ok: false, error: "Only base64 content encoding is supported." },
      { status: 415 },
    );
  }

  const guarded = await guardMutationContext({ projectId, regionId });
  if (!guarded.ok) {
    const { error } = guarded.result;
    return Response.json(
      { ok: false, error: error.message },
      {
        status:
          error.code === "authentication-required"
            ? 401
            : error.code === "context-changed"
              ? 409
              : 400,
      },
    );
  }

  const { projectToken, scope } = guarded.context;
  const catalog = await getServiceCatalog(projectToken!);
  if (!catalog) {
    return Response.json(
      {
        ok: false,
        error: "Cloud service discovery is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
  const endpoint = resolveServiceEndpoint(
    catalog,
    scope.regionId!,
    BARBICAN_SERVICE.serviceType,
    BARBICAN_SERVICE.serviceName,
  );
  if (!endpoint) {
    return Response.json(
      {
        ok: false,
        error: `Key Manager is not available in ${scope.regionId}.`,
      },
      { status: 404 },
    );
  }

  const headers: Record<string, string> = {
    "Content-Length": String(contentLength),
    "Content-Type": contentType,
    "OpenStack-API-Version": BARBICAN_API_VERSION,
    "X-Auth-Token": projectToken!,
  };
  if (contentEncoding) headers["Content-Encoding"] = contentEncoding;

  try {
    const uploadRequest: StreamingRequestInit = {
      method: "PUT",
      headers,
      body: request.body,
      cache: "no-store",
      duplex: "half",
      signal: request.signal,
    };
    const response = await fetch(
      serviceUrl(endpoint, `/v1/secrets/${secretId}`),
      uploadRequest,
    );
    if (!response.ok) {
      return mutationErrorResponse(
        response.status,
        "add this secret payload",
        response,
      );
    }

    revalidatePath("/key-manager");
    revalidatePath("/key-manager/secrets");
    revalidatePath(`/key-manager/secrets/${id}`);
    return Response.json({
      ok: true,
      secretId: id,
      requestId: requestId(response),
    });
  } catch (error) {
    console.error("[barbican/payload] payload upload failed", {
      error,
      projectId: scope.projectId,
      regionId: scope.regionId,
      secretId: id,
    });
    return Response.json(
      {
        ok: false,
        error: "Key Manager could not be reached. Try again shortly.",
      },
      { status: 502 },
    );
  }
}
