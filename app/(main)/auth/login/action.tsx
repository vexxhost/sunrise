"use server";

import {
  LoginFormSchema,
  LoginFormState,
  redirectToIdentityProvider,
} from "@/lib/auth";

export const login = async (state: LoginFormState, formData: FormData) => {
  const validatedFields = LoginFormSchema.safeParse({
    idProvider: formData.get("id_provider"),
    prompt: formData.get("authorization_prompt") || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  redirectToIdentityProvider(
    validatedFields.data.idProvider,
    validatedFields.data.prompt,
  );
};
