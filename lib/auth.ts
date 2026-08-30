import { z } from "zod";
import { redirect } from "next/navigation";
import { parseIdentityProviders } from "@/lib/auth-providers";

const idProviders = parseIdentityProviders(
  process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS,
);

if (idProviders.length === 0) {
  throw new Error("No Identity Providers configured");
}

export const LoginFormSchema = z.object({
  idProvider: z.string().refine((value) => idProviders.includes(value), {
    message: "Invalid Identity Provider",
  }),
});

export type LoginFormState =
  | {
      errors?: {
        idProvider?: string[];
      };
      message?: string;
    }
  | undefined;

export const redirectToIdentityProvider = (idProvider: string) => {
  redirect(
    (process.env.DASHBOARD_URL ?? "") +
      "/auth/oidc/login?idp=" +
      encodeURIComponent(idProvider),
  );
};
