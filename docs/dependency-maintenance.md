# Dependency Maintenance Notes

Last updated: 2026-08-29

This note captures the dependency pass so future sessions do not need to rediscover the same constraints.

## Current Policy

- Use `pnpm` as the package manager. The repo currently has `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.
- Use Node.js `24.20.0` LTS for reproducible development and CI. The repository pins it in `.node-version`; `package.json#engines` accepts supported Node 24 patch releases from `24.18.1` onward.
- Use pnpm `11.24.0`, sourced from `package.json#packageManager`. CI intentionally does not duplicate this version.
- Avoid package releases that are younger than roughly 2-5 days on npm.
- Prefer conservative non-major upgrades unless tests and app behavior justify a larger migration.
- Keep `pnpm-workspace.yaml` limited to its existing native-build allowlist; do not add transitive dependency overrides there.

## Updated In This Pass

- Next.js and `eslint-config-next` were moved to `16.3.3`.
- AWS SDK S3/STS clients and Smithy HTTP handler were moved to `3.1098.0` / `4.9.13`. Newer AWS SDK releases existed but were skipped because they were too fresh for the age policy.
- Radix UI packages, TanStack React Query, Tailwind packages, PostCSS, Autoprefixer, date-fns, zod, simple-icons, tailwind-merge, lucide-react, Headless UI, and Vitest were updated within the current major line where possible.
- Unused `framer-motion` was removed. Next 16.3's generated agent-rule files were disabled with `agentRules: false` so development does not create root `AGENTS.md` and `CLAUDE.md` files.
- Transitive security overrides were evaluated but removed so `pnpm-workspace.yaml` remains unchanged. Vulnerable packages owned by an upstream dependency should be cleared by upgrading that parent dependency when a sufficiently aged patched release is available.
- ESLint was migrated from the removed `next lint` command to `eslint .` with flat config in `eslint.config.mjs`.
- `postcss.config.mjs` now uses a named config export to avoid the anonymous default export lint warning.
- TypeScript's compile target was raised from obsolete `ES5` to Next.js's conservative `ES2017` baseline.
- The runtime baseline was moved from Node 22 in CI to Node 24.18.1 LTS, which includes npm 11.16.0.
- GitHub Actions now use `actions/setup-node` v7.0.0 and `pnpm/action-setup` v6.0.9, both pinned to immutable commits.
- CI now runs lint, unit tests, and a production build after a frozen-lockfile install.

## Verification

- Without workspace-level overrides, `pnpm audit --json` reports zero advisories across 623 dependencies. The PostCSS dependency chain resolves patched `nanoid 3.3.18`.
- `pnpm exec next build --webpack` completed successfully on Next.js 16.3.3. The default Turbopack build could not be completed in the Codex sandbox because its PostCSS worker was denied permission to bind an internal port.
- `pnpm test:run` completed successfully with 59 passing tests.
- `pnpm lint` completed successfully with 12 warnings and no errors.

## Remaining Warnings

- Object Storage client navigation: ten `@next/next/no-location-assign-relative-destination` warnings remain around internal `window.location.href` assignments.
- `components/DataTable.tsx`: TanStack `useReactTable` compatibility warning.
- `components/Instance/Interfaces.tsx`: TanStack `useReactTable` compatibility warning.

The new React Compiler-era lint rules also exposed existing app patterns around set-state-in-effect, purity, manual memoization, and unescaped entities. Those strict rules were disabled for this dependency pass so the dependency upgrade stayed scoped. Re-enable and fix them deliberately later.

## Deferred Upgrades

- React and React DOM currently resolve to `19.2.8`.
- `@types/react` and `@types/react-dom` currently resolve to `19.2.18` and `19.2.5`.
- Major upgrades were intentionally skipped for ESLint 10, TypeScript 7, `@types/node` 26, and `lucide-react` 1.x.
- AWS SDK `3.1121.0` remains deferred until it clears the repository's package-age policy.

## Suggested Next Iteration

- Add focused unit tests around table settings, polling, S3/STS project switching, and session expiry before doing larger framework moves.
- Add Playwright coverage for login, project switch, object storage list, Kubernetes detail tabs, and image upload status polling.
- Clean up the remaining lint warnings before enabling stricter React Compiler lint rules.
- Consider a small follow-up for React patch versions and type package patches after another build/test run.
