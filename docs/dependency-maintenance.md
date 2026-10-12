# Dependency Maintenance Notes

Last updated: 2026-10-12

This note captures the dependency pass so future sessions do not need to rediscover the same constraints.

## Current Policy

- Use `pnpm` as the package manager. The repo currently has `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.
- Use Node.js `24.21.0` LTS for reproducible development and CI. The repository pins it in `.node-version`; `package.json#engines` accepts supported Node 24 patch releases from `24.18.1` onward.
- Use pnpm `11.28.5`, sourced from `package.json#packageManager`. CI intentionally does not duplicate this version.
- Resolve versions from the registry when the upgrade is implemented instead of copying version pins from an older Renovate PR.
- Avoid package releases that are younger than roughly 2-5 days on npm, and treat pnpm and CI supply-chain checks as authoritative.
- Prefer conservative non-major upgrades unless tests and app behavior justify a larger migration.
- Keep `pnpm-workspace.yaml` limited to its existing native-build allowlist; do not add transitive dependency overrides there.

## Updated In This Pass

- Next.js and `eslint-config-next` were moved to `16.4.0`. The security fixes from the `16.3.8` line are included in this newer release.
- React and React DOM were moved to `19.3.0`; `@types/react` and `@types/react-dom` were moved to `19.3.0` with them.
- AWS SDK IAM/S3/STS clients and the S3 request presigner were moved to `3.1149.0`; the Smithy Node HTTP handler remains on `4.12.1`.
- ESLint was moved to `10.12.0` after Next.js 16.4 and TypeScript ESLint added support. Some bundled ESLint plugins still declare older peer ranges, but the complete Sunrise lint configuration passes.
- Lucide React was moved to `1.55.0`, Simple Icons to `16.35.0`, and Vitest to `5.0.3`. Vitest `5.0.4` was deliberately excluded because it had not passed the 24-hour release-age guard.
- The Radix UI components, TanStack React Query, PostCSS, Prettier, and compatible lockfile dependencies were refreshed to their current policy-eligible releases.
- Node.js type definitions resolve to `24.19.2`, remaining on the same major as the deployed Node 24 LTS runtime.
- Transitive `source-map-js`, `sharp`, and `brace-expansion` instances were refreshed to `1.2.2`, `0.35.5`, and `1.1.21` respectively, superseding their standalone Dependabot updates without workspace overrides.
- The transitive `js-yaml` dependency was refreshed to patched version `4.3.2`, resolving `GHSA-2883-xcg3-v3hh` without adding a workspace override.
- Unused `framer-motion` was removed. Next 16.3's generated agent-rule files were disabled with `agentRules: false` so development does not create root `AGENTS.md` and `CLAUDE.md` files.
- `pnpm-workspace.yaml` remains limited to native-build allowlisting. Transitive fixes should be obtained by refreshing compatible parents or lockfile resolutions instead of permanent overrides.
- ESLint was migrated from the removed `next lint` command to `eslint .` with flat config in `eslint.config.mjs`.
- `postcss.config.mjs` now uses a named config export to avoid the anonymous default export lint warning.
- TypeScript's compile target was raised from obsolete `ES5` to Next.js's conservative `ES2017` baseline.
- The runtime baseline was moved from Node 22 to Node `24.20.0` LTS in local development and CI; `package.json#engines` retains `24.18.1` as the supported floor.
- GitHub Actions now use `actions/setup-node` v7.0.0, `pnpm/action-setup` v6.0.10, and `step-security/harden-runner` v2.21.1, all pinned to immutable commits.
- CI now runs lint, unit tests, and a production build after a frozen-lockfile install.

## Verification

- `pnpm audit --prod` reports no known production vulnerabilities without workspace-level overrides.
- The default Turbopack production build completed successfully on Next.js `16.4.0`.
- The production Docker image completed a clean install and build on the repository's Node 24 Alpine runtime.
- `pnpm test:run` completed successfully with 134 test files and 826 passing tests on Vitest `5.0.3`.
- `pnpm lint` completed successfully with no warnings or errors on ESLint `10.12.0`.
- Chrome smoke testing covered demo SSO, the overview, image and icon rendering, S3 bucket listing, and project switching with the correct per-project RGW bucket set.
- PRs #127 through #129 passed their test, CodeQL, action analysis, JavaScript/TypeScript analysis, and DCO checks.

## Remaining Warnings

- `pnpm peers check` reports stale ESLint peer ranges from `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, and `eslint-plugin-react`. Next.js 16.4 documents ESLint 10 support, TypeScript ESLint declares ESLint 10 support, and the full lint run passes; re-check these declarations in the next refresh.
- The full development audit reports `GHSA-vfj7-8cjw-p6xm` through Next.js's lint stack. npm currently lists no patched `braces` release, and the package is absent from the production dependency audit.

## Deferred Upgrades

- TanStack React Table remains on `8.21.3`. Version 9 removes the table hooks and row-model exports used across Sunrise, so it needs a dedicated shared-table migration.
- TypeScript remains on 5 because TypeScript ESLint `8.71.1` supports TypeScript versions below `6.1.0`; the Renovate TypeScript 7 branch fails during lint initialization.
- pnpm remains on 11 because `package.json#engines` intentionally excludes pnpm 12. Treat pnpm 12 as a package-manager migration rather than a routine dependency refresh.
- `@types/node` remains on the Node 24 line to match Sunrise's deployed LTS runtime rather than following the unrelated Node 26 major.
- Re-query these constraints before the next dependency pass; this section records current compatibility boundaries, not permanent version pins.

## Suggested Next Iteration

- Add Playwright coverage for login, project switch, object storage list, Kubernetes detail tabs, and image upload status polling.
- Replace the remaining internal `window.location.href` assignments with router navigation where a full document reload is not intentional.
- Decide how to isolate TanStack Table from React Compiler memoization before attempting the version 9 API migration.
- Re-evaluate TypeScript 7 after TypeScript ESLint supports it, and pnpm 12 when Sunrise is ready to move its package-manager policy.
