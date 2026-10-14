export type IdentityProviderOption = {
  id: string;
  displayName: string;
  signInSlug: string;
};

type IdentityProviderEnvironment = Record<string, string | undefined>;

const DISPLAY_NAME = "SUNRISE_IDENTITY_PROVIDER_DISPLAY_NAME";
const SIGN_IN_SLUG = "SUNRISE_IDENTITY_PROVIDER_SIGN_IN_SLUG";
const SIGN_IN_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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

export function identityProviderEnvironmentSuffix(identityProvider: string) {
  const suffix = identityProvider
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!suffix) {
    throw new Error(
      `Identity Provider ${JSON.stringify(identityProvider)} cannot be mapped to an environment variable suffix`,
    );
  }
  return suffix;
}

export function identityProviderEnvironmentSuffixes(providerIds: string[]) {
  const providersBySuffix = new Map<string, string>();
  const suffixes = new Map<string, string>();

  for (const providerId of providerIds) {
    const suffix = identityProviderEnvironmentSuffix(providerId);
    const existing = providersBySuffix.get(suffix);
    if (existing) {
      throw new Error(
        `Identity Providers ${JSON.stringify(existing)} and ${JSON.stringify(providerId)} both map to environment variable suffix ${suffix}`,
      );
    }
    providersBySuffix.set(suffix, providerId);
    suffixes.set(providerId, suffix);
  }

  return suffixes;
}

function providerValue(
  environment: IdentityProviderEnvironment,
  base: string,
  suffix: string,
) {
  return environment[`${base}_${suffix}`]?.trim() || undefined;
}

export function getIdentityProviderOptions(
  environment: IdentityProviderEnvironment = process.env,
): IdentityProviderOption[] {
  const providerIds = parseIdentityProviders(
    environment.KEYSTONE_FEDERATION_IDENTITY_PROVIDERS,
  );
  if (providerIds.length === 0) {
    throw new Error("No Identity Providers configured");
  }

  const suffixes = identityProviderEnvironmentSuffixes(providerIds);
  const options = providerIds.map((id) => {
    const suffix = suffixes.get(id)!;
    const displayName = providerValue(environment, DISPLAY_NAME, suffix) ?? id;
    const configuredSlug = providerValue(environment, SIGN_IN_SLUG, suffix);
    if (configuredSlug && !SIGN_IN_SLUG_PATTERN.test(configuredSlug)) {
      throw new Error(
        `${SIGN_IN_SLUG}_${suffix} must be a lowercase DNS-style label containing at most 63 letters, digits, or hyphens`,
      );
    }

    return {
      id,
      displayName,
      signInSlug: configuredSlug ?? id,
    };
  });

  const providersBySlug = new Map<string, string>();
  for (const provider of options) {
    const existing = providersBySlug.get(provider.signInSlug);
    if (existing) {
      throw new Error(
        `Identity Providers ${JSON.stringify(existing)} and ${JSON.stringify(provider.id)} use the same sign-in slug ${JSON.stringify(provider.signInSlug)}`,
      );
    }
    providersBySlug.set(provider.signInSlug, provider.id);
  }

  return options;
}

export function findIdentityProviderById(
  providers: IdentityProviderOption[],
  id: string,
) {
  return providers.find((provider) => provider.id === id);
}

export function findIdentityProviderBySignInSlug(
  providers: IdentityProviderOption[],
  signInSlug: string,
) {
  return providers.find((provider) => provider.signInSlug === signInSlug);
}
