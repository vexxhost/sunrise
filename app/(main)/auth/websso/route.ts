import { getSession } from '@/lib/session';
import { finalizeKeystoneSession } from '@/lib/keystone/login';

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? '/';

/**
 * Legacy Keystone WebSSO POST callback. Kept as a fallback for setups still
 * driving login through Keystone's federation endpoint. The unified Sunrise
 * OIDC flow at `/auth/oidc/login` is the preferred path.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const formData = await request.formData();
  const token = formData.get('token');

  if (typeof token !== 'string' || token.length === 0) {
    console.error('Missing token in WebSSO response');
    session.keystone_unscoped_token = undefined;
    session.keystoneProjectToken = undefined;
    session.projectId = undefined;
    session.regionId = undefined;
    await session.save();
    return new Response('Invalid WebSSO response', { status: 400 });
  }

  await finalizeKeystoneSession(session, token);
  await session.save();

  return Response.redirect(DASHBOARD_URL, 303);
}
