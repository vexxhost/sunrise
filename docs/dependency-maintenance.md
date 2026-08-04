# Dependency Maintenance Notes

Last updated: 2026-08-04

This note captures the dependency pass so future sessions do not need to rediscover the same constraints.

## Current Policy

- Use `pnpm` as the package manager. The repo currently has `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.
- Use Node.js `24.18.1` LTS for reproducible development and CI. The repository pins it in `.node-version`; newer local Node releases may still be used for forward-compatibility checks.
- Use pnpm `11.19.0`, sourced from `package.json#packageManager`. CI intentionally does not duplicate this version.
- Avoid package releases that are younger than roughly 2-5 days on npm.
- Prefer conservative non-major upgrades unless tests and app behavior justify a larger migration.
- Keep `pnpm-workspace.yaml` limited to its existing native-build allowlist; do not add transitive dependency overrides there.

## Updated In This Pass

- Next.js and `eslint-config-next` were moved to `16.2.12`.
- AWS SDK S3/STS clients and Smithy HTTP handler were moved to `3.1098.0` / `4.9.13`. Newer AWS SDK releases existed but were skipped because they were too fresh for the age policy.
- Radix UI packages, TanStack React Query, Tailwind packages, PostCSS, Autoprefixer, date-fns, zod, simple-icons, tailwind-merge, lucide-react, framer-motion, Headless UI, and Vitest were updated within the current major line where possible.
- Transitive security overrides were evaluated but removed so `pnpm-workspace.yaml` remains unchanged. Vulnerable packages owned by an upstream dependency should be cleared by upgrading that parent dependency when a sufficiently aged patched release is available.
- ESLint was migrated from the removed `next lint` command to `eslint .` with flat config in `eslint.config.mjs`.
- `postcss.config.mjs` now uses a named config export to avoid the anonymous default export lint warning.
- TypeScript's compile target was raised from obsolete `ES5` to Next.js's conservative `ES2017` baseline.
- The runtime baseline was moved from Node 22 in CI to Node 24.18.1 LTS, which includes npm 11.16.0.
- GitHub Actions now use `actions/setup-node` v7.0.0 and `pnpm/action-setup` v6.0.9, both pinned to immutable commits.
- CI now runs lint, unit tests, and a production build after a frozen-lockfile install.

## Verification

- Without workspace-level overrides, `pnpm audit --json` reports five advisories across two Next.js transitive packages: `postcss 8.4.31` and optional `sharp 0.34.5`.
- `pnpm build` completed successfully on Next.js 16.2.12 using Node 24.18.1 and pnpm 11.19.0.
- `pnpm test:run` completed successfully with 16 passing tests using Node 24.18.1 and pnpm 11.19.0.
- `pnpm lint` completed successfully with warnings only using Node 24.18.1 and pnpm 11.19.0.

## Remaining Warnings

- `app/(main)/compute/images/ImagesClient.tsx`: `useMemo` dependency warning around `activeVisibleImageQueries`.
- `components/DataTable.tsx`: TanStack `useReactTable` compatibility warning and `useMemo` dependency warning around `pageRows`.
- `components/FilterBuilder.tsx`: `useEffect` dependency warnings around `getCurrentItems` and `highlightedIndex`.
- `components/Instance/Interfaces.tsx`: TanStack `useReactTable` compatibility warning.

The new React Compiler-era lint rules also exposed existing app patterns around set-state-in-effect, purity, manual memoization, and unescaped entities. Those strict rules were disabled for this dependency pass so the dependency upgrade stayed scoped. Re-enable and fix them deliberately later.

## Deferred Upgrades

- React and React DOM remain locked at `19.2.0` even though newer patch releases exist.
- `@types/react` and `@types/react-dom` remain locked at `19.2.2`.
- Major upgrades were intentionally skipped for ESLint 10, TypeScript 7, `@types/node` 26, and `lucide-react` 1.x.
- Prettier was not moved in this pass to avoid introducing formatter churn during dependency/security work.
- pnpm 11.20.0 and Node 24.19.0 were skipped because both were published on 2026-08-03 and had not completed the cooling-off period.

## Suggested Next Iteration

- Add focused unit tests around table settings, polling, S3/STS project switching, and session expiry before doing larger framework moves.
- Add Playwright coverage for login, project switch, object storage list, Kubernetes detail tabs, and image upload status polling.
- Clean up the remaining lint warnings before enabling stricter React Compiler lint rules.
- Consider a small follow-up for React patch versions and type package patches after another build/test run.
