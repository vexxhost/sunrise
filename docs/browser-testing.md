# Browser testing

Sunrise uses Playwright for browser-level regression coverage. The default
suite starts a local Next.js development server and a minimal fake OIDC
discovery server. It does not require OpenStack credentials and cannot complete
an authenticated cloud session.

Install Chromium once on a development machine:

```bash
pnpm exec playwright install chromium
```

Run the headless suite:

```bash
pnpm test:e2e
```

Open Playwright's interactive test runner:

```bash
pnpm test:e2e:ui
```

The fake provider is intentionally limited to discovery and an authorization
landing page. Authenticated project and resource tests must use an explicitly
supplied short-lived browser storage state or a disposable test identity. Do
not commit credentials, browser storage state, or a production-only test bypass.

The local command uses the Next.js development server for a fast feedback loop.
CI builds Sunrise and runs the same suite against its standalone production
output, including the static and public assets copied into the container image.
Every test fails on uncaught page exceptions and browser `console.error` output
in addition to its workflow assertions.
