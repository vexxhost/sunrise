import 'server-only';
import { getSession } from '@/lib/session';
import {
  getServiceCatalog,
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from '@/lib/openstack/catalog';

const SERVICE_TYPE = 'object-storage-s3';
const SERVICE_NAME = 's3';

// RGW ignores the AWS region but the SDK requires one for SigV4.
export const S3_REGION = 'us-east-1';

type S3EndpointContext = {
  regionId: string;
  token: string;
  catalog?: OpenStackCatalogService[];
};

/**
 * Resolve the RADOSGW S3 endpoint URL from the OpenStack service catalog
 * for the active region in the current session.
 *
 * Looks up service type `object-storage-s3` / name `s3` (public interface).
 */
export async function getS3Endpoint(
  context?: S3EndpointContext,
): Promise<string> {
  const session = context ? undefined : await getSession();
  const regionId = context?.regionId ?? session?.regionId;
  const token =
    context?.token ??
    session?.keystoneProjectToken ??
    session?.keystone_unscoped_token;
  if (!regionId) throw new Error('No active region in session');
  if (!token) throw new Error('No Keystone token in session');

  const catalog = context?.catalog ?? (await getServiceCatalog(token));
  const endpoint = catalog
    ? resolveServiceEndpoint(catalog, regionId, SERVICE_TYPE, SERVICE_NAME)
    : null;
  if (!endpoint) {
    throw new Error(
      `S3 endpoint ('${SERVICE_NAME}' / ${SERVICE_TYPE}) not found in catalog for region ${regionId}`,
    );
  }
  return endpoint;
}
