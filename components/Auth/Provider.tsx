import Login from "@/components/Auth/Login";
import { getSession } from "@/lib/session";

export default async function Provider({ children }: any) {
  const session = await getSession();
  if (!session.keystone_unscoped_token) {
    return <Login />;
  }

  return <>{children}</>;
}
