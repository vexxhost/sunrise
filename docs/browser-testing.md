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

## Authenticated cloud smoke tests

Real-cloud checks are opt-in and separate from the deterministic CI suite. They
reuse a short-lived identity-provider browser session to create a fresh Sunrise
session for each test. The captured file excludes Sunrise session, preference,
and application storage data, but it still contains sensitive IdP cookies: keep
it local, short-lived, and delete it when QA is complete.

Start Sunrise with the cloud configuration you want to test:

```bash
pnpm dev --hostname 127.0.0.1 --port 9990
```

In another terminal, open the headed capture flow and complete SSO manually:

```bash
pnpm test:e2e:cloud:capture -- --profile cloud --provider demo
```

The provider argument is optional; without it, enter the provider in Sunrise.
Profiles are written with user-only permissions below `playwright/.auth/`,
which is ignored by Git. Run the read-only smoke suite with:

```bash
SUNRISE_E2E_CLOUD_PROFILE=cloud pnpm test:e2e:cloud
```

The capture URL must match `SUNRISE_DASHBOARD_URL` exactly. The default is
`http://localhost:9990`; pass `--url` and `SUNRISE_E2E_CLOUD_BASE_URL` together
when the configured dashboard origin differs.

The suite starts or reuses local Sunrise automatically, verifies authenticated
deep links and live collection reads, switches project/region when alternatives
exist inside disposable test sessions, checks stale-resource recovery, and
opens Object Storage when the active provider and region expose it. It never
creates, edits, or deletes cloud resources.

Disposable mutation checks require an additional, resource-specific opt-in.
The key-pair check imports a unique public-only test key into the active project
and removes it through the Sunrise UI in a `finally` block:

```bash
SUNRISE_E2E_CLOUD_PROFILE=cloud \
SUNRISE_E2E_CLOUD_MUTATIONS=key-pairs pnpm test:e2e:cloud
```

Run mutation checks only with a disposable test identity and project. An
interrupted process cannot guarantee cleanup, so confirm that no key pair whose
name starts with `sunrise-e2e-` remains after an interrupted run. Never enable
cloud mutations in the deterministic browser workflow.

To test an already deployed Sunrise instead of local development, capture and
run against the same origin:

```bash
pnpm test:e2e:cloud:capture -- --profile staging --url https://sunrise.example
SUNRISE_E2E_CLOUD_PROFILE=staging \
SUNRISE_E2E_CLOUD_BASE_URL=https://sunrise.example \
SUNRISE_E2E_CLOUD_START_SERVER=0 pnpm test:e2e:cloud
```

Use `SUNRISE_E2E_CLOUD_IGNORE_HTTPS_ERRORS=1` only for disposable environments
whose browser-facing certificate is intentionally untrusted. Set it for both
the capture command and the smoke suite. Recapture a profile whenever its IdP
session expires. Never add a password, token, browser state file, or production
authentication bypass to the repository or CI.
