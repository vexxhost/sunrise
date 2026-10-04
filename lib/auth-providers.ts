export function parseIdentityProviders(value: string | undefined) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean),
    ),
  ];
}
