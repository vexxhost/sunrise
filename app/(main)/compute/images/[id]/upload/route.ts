import { revalidatePath } from "next/cache";

import { guardMutationContext } from "@/lib/mutation-context";
import { mutationErrorForStatus, normalizeMutationProjectId } from "@/lib/mutations";
import {
  getServiceCatalog,
  resolveServiceEndpoint,
} from "@/lib/openstack/catalog";
import { serviceUrl } from "@/lib/openstack/request";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type StreamingRequestInit = RequestInit & { duplex: "half" };

function requestId(response: Response) {
  return response.headers.get("x-openstack-request-id") ?? undefined;
}

function errorResponse(status: number, action: string, id?: string) {
  const error = mutationErrorForStatus(status, action, id);
  return Response.json(
    { ok: false, error: error.message, requestId: error.requestId },
    { status },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const projectId = request.headers.get("x-sunrise-project-id") ?? "";
  const regionId = request.headers.get("x-sunrise-region-id") ?? "";
  const contentLength = request.headers.get("content-length");

  if (!id || !request.body || !contentLength || Number(contentLength) <= 0) {
    return Response.json(
      { ok: false, error: "Choose a non-empty image file to upload." },
      { status: 400 },
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
      { ok: false, error: "Cloud service discovery is temporarily unavailable." },
      { status: 503 },
    );
  }

  const endpoint = resolveServiceEndpoint(
    catalog,
    scope.regionId!,
    "image",
    "glance",
  );
  if (!endpoint) {
    return Response.json(
      { ok: false, error: `Glance is not available in ${scope.regionId}.` },
      { status: 404 },
    );
  }

  const imageUrl = serviceUrl(endpoint, `/v2/images/${encodeURIComponent(id)}`);
  const headers = { "X-Auth-Token": projectToken! };

  try {
    const imageResponse = await fetch(imageUrl, { headers, cache: "no-store" });
    if (!imageResponse.ok) {
      return errorResponse(
        imageResponse.status,
        "inspect this image before uploading data",
        requestId(imageResponse),
      );
    }

    const image = (await imageResponse.json()) as { owner?: string | null };
    if (
      !image.owner ||
      normalizeMutationProjectId(image.owner) !==
        normalizeMutationProjectId(scope.projectId)
    ) {
      return Response.json(
        { ok: false, error: "Only images owned by the active project can receive data." },
        { status: 403 },
      );
    }

    const uploadRequest: StreamingRequestInit = {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": request.headers.get("content-type") || "application/octet-stream",
        "Content-Length": contentLength,
        "X-Openstack-Image-Size": contentLength,
      },
      body: request.body,
      cache: "no-store",
      duplex: "half",
      signal: request.signal,
    };
    const uploadResponse = await fetch(`${imageUrl}/file`, uploadRequest);

    if (!uploadResponse.ok) {
      return errorResponse(
        uploadResponse.status,
        "upload image data",
        requestId(uploadResponse),
      );
    }

    revalidatePath("/compute");
    revalidatePath("/compute/images");
    revalidatePath(`/compute/images/${id}`);
    return Response.json({ ok: true, imageId: id, requestId: requestId(uploadResponse) });
  } catch (error) {
    console.error("[glance/upload] image upload failed", {
      error,
      imageId: id,
      projectId: scope.projectId,
      regionId: scope.regionId,
    });
    return Response.json(
      { ok: false, error: "Glance could not be reached. Try again shortly." },
      { status: 502 },
    );
  }
}
