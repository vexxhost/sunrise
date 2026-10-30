<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Shared UI kit

`components/ui/button.tsx`, `components/ui/spinner.tsx`, `components/ui/copy-button.tsx`, `lib/utils.ts` and the theme tokens in `app/globals.css` are copied from [vexxhost/ui](https://github.com/vexxhost/ui). Change them there, then run `pnpm ui:sync`; CI fails when the copies here drift.

- Red outline, ghost or link actions use `tone="danger"`; solid red stays `variant="destructive"`.
- Pending actions use `loading`, which swaps the leading icon for a spinner and disables the button. Do not place `<Spinner />` inside buttons by hand.
- Links that look like buttons put `buttonVariants()` on the `<a>` or `<Link>`; do not render links through `Button`.
- Copy-to-clipboard controls use `CopyButton`.
- Sunrise-only tokens (`--service-*`, `--brand-*`, `--sunrise-auth-*`) and the opt-in `data-color-palette="sunrise"` palette stay in `app/globals.css`.
