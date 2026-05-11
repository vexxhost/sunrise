"use server";

import {
  LoginFormSchema,
  LoginFormState,
  redirectToIdentityProvider,
} from "@/lib/auth";

export const login = async (state: LoginFormState, formData: FormData) => {
  const validatedFields = LoginFormSchema.safeParse({
    idProvider: formData.get("id_provider"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  redirectToIdentityProvider(validatedFields.data["idProvider"]);
};
