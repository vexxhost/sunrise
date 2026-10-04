import { z } from "zod";
import { redirect } from "next/navigation";
import { parseIdentityProviders } from "@/lib/auth-providers";
import type { OidcAuthorizationPrompt } from "@/lib/oidc/sunrise";

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
  prompt: z.enum(["login", "select_account"]).optional(),
});

export type LoginFormState =
  | {
      errors?: {
        idProvider?: string[];
      };
      message?: string;
    }
  | undefined;

export const redirectToIdentityProvider = (
  idProvider: string,
  prompt?: OidcAuthorizationPrompt,
) => {
  const url = new URL(
    "/auth/oidc/login",
    process.env.SUNRISE_DASHBOARD_URL ?? "http://localhost",
  );
  url.searchParams.set("idp", idProvider);
  if (prompt) url.searchParams.set("prompt", prompt);
  redirect(url.toString());
};
