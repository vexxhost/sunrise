import 'server-only';
import { getSession } from '@/lib/session';
import { getServiceEndpoint } from '@/lib/openstack/catalog';

const SERVICE_TYPE = 'object-storage-s3';
const SERVICE_NAME = 's3';

// RGW ignores the AWS region but the SDK requires one for SigV4.
export const S3_REGION = 'us-east-1';

/**
 * Resolve the RADOSGW S3 endpoint URL from the OpenStack service catalog
 * for the active region in the current session.
 *
 * Looks up service type `object-storage-s3` / name `s3` (public interface).
 */
export async function getS3Endpoint(): Promise<string> {
  const session = await getSession();
  const regionId = session.regionId;
  const token =
    session.keystoneProjectToken ?? session.keystone_unscoped_token;
  if (!regionId) throw new Error('No active region in session');
  if (!token) throw new Error('No Keystone token in session');
  const endpoint = await getServiceEndpoint(
    regionId,
    SERVICE_TYPE,
    SERVICE_NAME,
    token
  );
  if (!endpoint) {
    throw new Error(
      `S3 endpoint ('${SERVICE_NAME}' / ${SERVICE_TYPE}) not found in catalog for region ${regionId}`
    );
  }
  return endpoint;
}
