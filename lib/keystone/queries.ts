import { getSession } from "@/lib/session";
import { createLogger } from "@/lib/logging";
import { getProjectScopedTokenContext } from "@/lib/keystone/login";
import { isKeystoneAuthFailure } from "@/lib/keystone/session";
import type { Region, Project } from "@/types/openstack";
import { redirect } from "next/navigation";
import {
  captureOidcSessionAuthority,
  saveOidcSessionIfAuthoritative,
} from "@/lib/oidc/session-authority";
import { openstackRequestId } from "@/lib/openstack/request-id";
import { currentSunriseRequestId } from "@/lib/request-correlation.server";

const logger = createLogger("keystone.query");

/**
 * Server-side function to fetch regions
 * Uses the unscoped token from the session
 */
export async function getRegions(): Promise<Region[]> {
  const requestId = await currentSunriseRequestId();
  const session = await getSession();
  const authority = captureOidcSessionAuthority(session);

  if (!session.keystone_unscoped_token) {
    return [];
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.KEYSTONE_API}/v3/regions`, {
      headers: {
        "X-Auth-Token": session.keystone_unscoped_token,
      },
      cache: "no-store",
    });
  } catch (error) {
    logger.error("unreachable", {
      error,
      operation: "list-regions",
      requestId,
    });
    return [];
  }

  if (!response.ok) {
    if (isKeystoneAuthFailure(response.status)) {
      redirect("/auth/refresh");
    }
    logger.warn("request-failed", {
      operation: "list-regions",
      requestId,
      status: response.status,
      upstreamRequestId: openstackRequestId(response),
    });
    return [];
  }

  try {
    const data = (await response.json()) as { regions: Region[] };
    const regions = data.regions.sort((a, b) => a.id.localeCompare(b.id));

    if (!session.regionId && regions.length > 0) {
      session.regionId = regions[0].id;
      await saveOidcSessionIfAuthoritative(session, authority);
    }

    return regions;
  } catch (error) {
    logger.error("invalid-response", {
      error,
      operation: "list-regions",
      requestId,
    });
    return [];
  }
}

/**
 * Server-side function to fetch projects
 * Uses the unscoped token from the session
 */
export async function getProjects(): Promise<Project[]> {
  const requestId = await currentSunriseRequestId();
  const session = await getSession();
  const authority = captureOidcSessionAuthority(session);

  if (!session.keystone_unscoped_token) {
    return [];
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/projects`, {
      headers: {
        "X-Auth-Token": session.keystone_unscoped_token,
      },
      cache: "no-store",
    });
  } catch (error) {
    logger.error("unreachable", {
      error,
      operation: "list-projects",
      requestId,
    });
    return [];
  }

  if (!response.ok) {
    if (isKeystoneAuthFailure(response.status)) {
      redirect("/auth/refresh");
    }
    logger.warn("request-failed", {
      operation: "list-projects",
      requestId,
      status: response.status,
      upstreamRequestId: openstackRequestId(response),
    });
    return [];
  }

  try {
    const data = (await response.json()) as { projects: Project[] };
    const projects = data.projects.sort((a, b) => a.name.localeCompare(b.name));

    if (!session.projectId && projects.length > 0) {
      const project = projects[0];
      const scopedContext = await getProjectScopedTokenContext(
        session.keystone_unscoped_token,
        project.id,
      );

      if (scopedContext) {
        session.projectId = project.id;
        session.keystoneProjectToken = scopedContext.value;
        session.keystoneProjectRoles = scopedContext.roles;
        await saveOidcSessionIfAuthoritative(session, authority);
      }
    }

    return projects;
  } catch (error) {
    logger.error("invalid-response", {
      error,
      operation: "list-projects",
      requestId,
    });
    return [];
  }
}
