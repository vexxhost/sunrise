export function parseIdentityProviders(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
}
