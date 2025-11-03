import { getSession } from "@/lib/session";
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

    if (!session.projectToken) {
      return Response.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
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
      const response = await fetch(`${process.env.KEYSTONE_API}/v3/auth/catalog`, {
        headers: {
          "X-Auth-Token": session.projectToken,
        } as HeadersInit,
        next: { revalidate: 300 }, // Cache for 5 minutes
      });

      if (!response.ok) {
        return Response.json(
          { error: `Failed to fetch catalog: ${response.statusText}` },
          { status: response.status }
        );
      }

      const catalogData = await response.json();
      const catalog = catalogData.catalog;

      // Find the service in the catalog
      const serviceEntry = catalog.find(
        (item: any) => item.type === serviceType || item.name === service
      );

      if (!serviceEntry) {
        return Response.json(
          { error: `Service '${service}' not found in catalog` },
          { status: 404 }
        );
      }

      // Find the endpoint for the specified region
      const endpoint = serviceEntry.endpoints.find(
        (ep: any) => ep.interface === 'public' && ep.region === region
      );

      if (!endpoint) {
        return Response.json(
          { error: `No public endpoint found for service '${service}' in region '${region}'` },
          { status: 404 }
        );
      }

      baseUrl = endpoint.url;
    }

    // Construct the full URL
    const url = `${baseUrl}/${apiPath.join('/')}${request.nextUrl.search}`;

    // Forward headers
    const headers: HeadersInit = {
      'X-Auth-Token': session.projectToken,
      'Content-Type': 'application/json',
    };

    // Prepare request options
    const options: RequestInit = {
      method,
      headers,
    };

    // Add body for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const body = await request.text();
      if (body) {
        options.body = body;
      }
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

    // Return the response
    return Response.json(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
