import { z } from "zod";
import { redirect } from "next/navigation";
import {
  findIdentityProviderById,
  getIdentityProviderOptions,
} from "@/lib/auth-providers";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import type { OidcAuthorizationPrompt } from "@/lib/oidc/sunrise";

export const LoginFormSchema = z.object({
  idProvider: z
    .string()
    .trim()
    .transform((value, context) => {
      const provider = findIdentityProviderById(
        getIdentityProviderOptions(),
        value,
      );
      if (!provider) {
        context.addIssue({
          code: "custom",
          message: "Invalid Identity Provider",
        });
        return z.NEVER;
      }
      return provider.id;
    }),
  prompt: z.enum(["login", "select_account"]).optional(),
  returnTo: z.string().optional(),
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
  returnTo?: string,
) => {
  const url = new URL(
    "/auth/oidc/login",
    process.env.SUNRISE_DASHBOARD_URL ?? "http://localhost",
  );
  url.searchParams.set("idp", idProvider);
  if (prompt) url.searchParams.set("prompt", prompt);
  const normalizedReturnTo = normalizeAuthReturnTo(returnTo);
  if (normalizedReturnTo !== "/") {
    url.searchParams.set("returnTo", normalizedReturnTo);
  }
  redirect(url.toString());
};
