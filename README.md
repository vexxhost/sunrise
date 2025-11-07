# Sunrise

## Getting Started

1. Create a client inside Keycloak which will be used for authenticating
   the user using Sunrise.

2. Make a copy of the file `.env.dist` and rename the copy to `.env.local` in the root of the project and update the
   variables (refer to the values as examples):

3. Start the development server

   ```bash
   npm run dev -- -p 9990
   ```

4. Navigate to the following URL. You will be redirected to login with Keycloak:

   [http://localhost:9990](http://localhost:9990)

## End-to-End Tests

Playwright powers the Sunrise E2E suite and defaults to an in-process mock of Keystone, Nova, Neutron, Cinder, Glance, and Magnum. The mock gives deterministic responses so the UI can be validated without a live OpenStack deployment.

### Prerequisites

1. Install the Playwright browsers (one time):

   ```bash
   npx playwright install
   ```

2. Ensure the mock API port (`6101` by default) is available.

### Running against the bundled mocks

```bash
cd sunrise
PLAYWRIGHT_SKIP_WEBSERVER=1 npm run dev -- --port 9990 &
# wait for Next.js to boot, then in another shell:
npm run test:e2e
```

The suite seeds session cookies through `app/api/test/session` (enabled by default when mocks are used) and intercepts OpenStack API calls with canned responses, including Magnum clusters and templates.

### Switching to a live OpenStack environment

```bash
LIVE_BACKEND=1 \
KEYSTONE_API="https://keystone.example.com" \
KEYSTONE_FEDERATION_IDENTITY_PROVIDERS="example-idp" \
KEYSTONE_FEDERATION_IDENTITY_PROVIDER_PROTOCOL="saml2" \
DASHBOARD_URL="https://sunrise.example.com" \
npm run test:e2e:live
```

When `LIVE_BACKEND=1`, the mock fixture is disabled and real OpenStack APIs are used. Make sure the dev server (`npm run dev` or `npm run start`) inherits the same environment so server components resolve the correct endpoints.

### Providing environment overrides

- Optionally create a `.env.e2e` file in the project root containing any secrets or endpoint overrides required for your deployment (e.g. `KEYSTONE_API`, `SESSION_SECRET`, `PLAYWRIGHT_BASE_URL`).
- The Playwright config automatically loads `.env.e2e` if it exists. To point at a different file, set `PLAYWRIGHT_ENV_PATH=/absolute/path/to/your.env` before running the tests.
- Variables from the environment file can still be overridden per command by exporting them or inlining them (as shown in the live example above).

### Troubleshooting

- **Next.js warns about Turbopack workspace roots** – start the dev server manually with `PLAYWRIGHT_SKIP_WEBSERVER=1` so Playwright only launches the tests.
- **WebKit browser launch errors** – install system dependencies via `npx playwright install-deps` (may require `sudo`).
- **Session seeding disabled** – set `ENABLE_TEST_ROUTES=1` when running against mocks; for live runs you likely want it disabled (`ENABLE_TEST_ROUTES=0`).

## Manual validation checklist (Cinder volumes)

Execute the following steps against a development OpenStack environment after starting the Sunrise dev server:

1. **Create volume**
   - Go to `Compute → Volumes`
   - Use `Create Volume` to provision a new volume with a unique name and non-zero size
   - Confirm the volume appears in the table and is reachable via the detail page

2. **Extend volume**
   - Open the volume detail page and choose `Manage Volume → Extend Size`
   - Increase the size and verify the new size after the task completes

3. **Attach/detach**
   - From the detail actions, attach the volume to a test instance (supply instance UUID and mountpoint)
   - Confirm the attachment is listed in the `Attachments` tab
   - Detach the volume (force flag optional) and verify the attachment list updates

4. **Snapshots**
   - Create a snapshot from the detail actions; ensure it appears under the `Snapshots` tab
   - Delete the snapshot and confirm it is removed

5. **Backups**
   - Create a backup (incremental optional) and verify it appears under `Backups`
   - Restore the backup (optionally specifying a new volume name) and verify the task succeeds
   - Delete the backup and confirm it is removed

6. **Delete volume**
   - From `Manage Volume → Delete Volume`, delete (or force delete) the test volume
   - Ensure the listing no longer contains the volume and related queries refresh successfully

## Manual validation checklist (Magnum clusters)

1. **Cluster templates**
   - Navigate to `Kubernetes → Cluster Templates`
   - Create a new template, ensuring labels JSON is accepted
   - Edit the template to change public visibility or flavors
- Delete the template and verify the table refreshes

2. **Cluster inventory**
   - Visit `Kubernetes → Clusters` and confirm existing clusters render with status/health badges
   - Open the cluster detail page and review node groups, events, and endpoint metadata

3. **Create cluster**
   - Use `Create Cluster`, walk through the three-step wizard, and submit a build
   - Confirm the new record appears in the list with an in-progress status

4. **Scale and upgrade**
   - Select a cluster, choose `Scale`, and adjust the worker count
   - Select `Upgrade`, pointing to a different template, and verify the action submits

5. **Rotate certificates**
   - Trigger both `Rotate certificates` and `Rotate CA` actions and confirm toast notifications are shown

6. **Delete cluster**
   - Select one or more clusters, choose `Delete`, and ensure the list updates after the request
