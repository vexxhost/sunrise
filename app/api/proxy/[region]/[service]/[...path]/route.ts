import { getSession } from "@/lib/session";
import { getServiceEndpoint } from "@/lib/openstack/catalog";
import { NextRequest } from "next/server";

/**
 * Generic OpenStack API proxy
 * Handles CORS, authentication, and region-aware routing for client-side requests
 *
 * Usage: /api/proxy/<region>/<service>/<path>
 *        /api/proxy/us-east-1/nova/servers/detail
 *        /api/proxy/us-east-1/cinder/volumes
 *        /api/proxy/global/keystone/v3/regions
 *
 * The region is extracted from the URL and used to find the correct endpoint.
 * Use 'global' as the region for keystone (identity) service.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ region: string; service: string; path: string[] }> }
) {
  return handleRequest(request, params, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ region: string; service: string; path: string[] }> }
) {
  return handleRequest(request, params, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ region: string; service: string; path: string[] }> }
) {
  return handleRequest(request, params, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ region: string; service: string; path: string[] }> }
) {
  return handleRequest(request, params, 'DELETE');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ region: string; service: string; path: string[] }> }
) {
  return handleRequest(request, params, 'PATCH');
}

async function handleRequest(
  request: NextRequest,
  params: Promise<{ region: string; service: string; path: string[] }>,
  method: string
) {
  try {
    const session = await getSession();
    const { region, service, path: apiPath } = await params;

    // Check if client is requesting to use the unscoped token
    let useUnscopedToken = false;
    let requestBody: string | null = null;

    // Check for __UNSCOPED__ marker in X-Auth-Token header (for GET/DELETE requests)
    const clientAuthToken = request.headers.get('X-Auth-Token');
    if (clientAuthToken === '__UNSCOPED__') {
      useUnscopedToken = true;
    }

    // Read body once for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      requestBody = await request.text();

      // Check for __UNSCOPED__ marker in POST body for token requests
      if (service === 'keystone' && apiPath.join('/').includes('auth/tokens') && requestBody) {
        try {
          const body = JSON.parse(requestBody);
          if (body?.auth?.identity?.token?.id === '__UNSCOPED__') {
            useUnscopedToken = true;
            // Replace the marker with the actual unscoped token
            body.auth.identity.token.id = session.keystone_unscoped_token;
            // Update the request body with the modified version
            requestBody = JSON.stringify(body);
          }
        } catch (e) {
          // If we can't parse the body, just continue normally
        }
      }
    }

    // Check authentication
    if (useUnscopedToken) {
      // Request is using __UNSCOPED__ marker - verify unscoped token exists in session
      if (!session.keystone_unscoped_token) {
        return Response.json(
          { error: 'Not authenticated - no unscoped token in session' },
          { status: 401 }
        );
      }
    } else {
      // Regular request - prefer X-Auth-Token from header, fall back to session token
      if (!clientAuthToken && !session.keystoneProjectToken) {
        return Response.json(
          { error: 'Not authenticated - missing X-Auth-Token header and no session token' },
          { status: 401 }
        );
      }
    }

    // Map service names to their OpenStack service types
    const serviceTypeMap: Record<string, string> = {
      keystone: 'identity',
      nova: 'compute',
      neutron: 'network',
      cinder: 'volumev3',
      glance: 'image',
      heat: 'orchestration',
      magnum: 'container-infra',
      designate: 'dns',
      manila: 'sharev2',
      swift: 'object-store',
    };

    const serviceType = serviceTypeMap[service];

    // For keystone (global services), always use the environment variable
    let baseUrl: string;
    if (service === 'keystone' || region === 'global') {
      baseUrl = process.env.KEYSTONE_API!;
    } else {
      if (!serviceType) {
        return Response.json(
          { error: `Unknown service: ${service}` },
          { status: 400 }
        );
      }

      // Get the service catalog to find the correct endpoint
      // Use unscoped token if marker is present, otherwise use client's token or session token
      const catalogToken = useUnscopedToken
        ? session.keystone_unscoped_token!
        : (clientAuthToken || session.keystoneProjectToken!);

      const endpoint = await getServiceEndpoint(region, serviceType, service, catalogToken);

      if (!endpoint) {
        return Response.json(
          { error: `Failed to get endpoint for service '${service}' in region '${region}'` },
          { status: 404 }
        );
      }

      baseUrl = endpoint;
    }

    // Construct the full URL
    const url = `${baseUrl}/${apiPath.join('/')}${request.nextUrl.search}`;

    // Forward headers - use unscoped token if marker present, otherwise use client's token or session token
    const headers: HeadersInit = {
      'X-Auth-Token': useUnscopedToken
        ? session.keystone_unscoped_token!
        : (clientAuthToken || session.keystoneProjectToken!),
      'Content-Type': 'application/json',
    };

    // Forward OpenStack-API-Version header if present
    const apiVersion = request.headers.get('OpenStack-API-Version');
    if (apiVersion) {
      headers['OpenStack-API-Version'] = apiVersion;
    }

    // Prepare request options
    const options: RequestInit = {
      method,
      headers,
    };

    // Add body for POST/PUT/PATCH requests
    if (requestBody) {
      options.body = requestBody;
    }

    // Make the request to OpenStack API
    const response = await fetch(url, options);

    // Get response data
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Prepare response headers
    const responseHeaders: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // For token requests, pass through the X-Subject-Token header
    if (useUnscopedToken) {
      const subjectToken = response.headers.get('X-Subject-Token');
      if (subjectToken) {
        responseHeaders['X-Subject-Token'] = subjectToken;
      }
    }

    // Return the response
    return Response.json(data, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
