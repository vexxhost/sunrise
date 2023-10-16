import { session } from '@/lib/session';

export async function POST(request: Request) {
  const formData = await request.formData();

  const token = formData.get('token');
  await session().set('keystone_unscoped_token', token);

  const redirectTo = await session().get('redirect_to');
  return Response.redirect(process.env.DASHBOARD_URL + redirectTo, 303);
}
