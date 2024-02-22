import { session } from "@/lib/session";
import { redirect } from "next/navigation";

export const startFederatedAuth = async (redirectTo?: string) => {
  //await session().set("redirect_to", redirectTo || "/");
  if (process.env.TOKEN) {
    redirect('/auth/websso');
  }
  redirect(
    process.env.KEYSTONE_API +
      "/v3/auth/OS-FEDERATION/identity_providers/" +
      process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDER +
      "/protocols/" +
      process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL +
      "/websso?origin=" +
      process.env.DASHBOARD_URL +
      "/auth/websso/"
  );
};
