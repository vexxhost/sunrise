# Sunrise

## Local Development

1. Create a client inside Keycloak which will be used for authenticating
   the user using Sunrise.

2. Copy `.env.dist` to `.env.local` and configure the local cloud and identity
   values. Never commit `.env.local`.

3. Start the development server:

   ```bash
   pnpm dev -p 9990
   ```

4. Navigate to the following URL. You will be redirected to login with Keycloak:

   [http://localhost:9990](http://localhost:9990)

## Local Production Container

The Compose stack builds the Next.js standalone runtime for the local host
architecture and runs it as a non-root user with a read-only root filesystem.
It also starts an internal Redis-compatible service and selects the server-side
session backend, so the same image can be exercised with the persistence model
intended for multiple Sunrise replicas. The local stack defaults to Valkey
while all Sunrise configuration uses the implementation-neutral Redis protocol
vocabulary.

```bash
docker compose build sunrise
docker compose up -d
docker compose ps
docker compose logs -f sunrise
```

Override the implementation image without changing Sunrise configuration:

```bash
SUNRISE_REDIS_IMAGE=redis:8.10.1-alpine docker compose --profile replica up -d --force-recreate redis sunrise sunrise-replica
```

Unset `SUNRISE_REDIS_IMAGE` and recreate the same services to return to the
default Valkey image. The Compose service and hostname remain `redis` in both
cases.

Sunrise currently uses only the shared Redis OSS 7.2 command and RESP surface,
which Valkey supports with ordinary Redis clients. Keep implementation-specific
modules and newer vendor-only commands out of the session layer if this
switchability is required. The local data directory is ephemeral by design; do
not reuse Redis 7.4+ or Redis 8 persistence files with Valkey during a
production migration.

The default local topology is intentionally plain and unauthenticated. The same
Compose setup also provides three production-oriented connection exercises:

| Mode                            | Command                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Password authentication         | `SUNRISE_REDIS_PASSWORD='local-test-password' docker compose --profile replica up -d --force-recreate redis sunrise sunrise-replica`                                           |
| TLS                             | `docker compose -f compose.yaml -f compose.redis-tls.yaml --profile replica up -d --force-recreate redis sunrise sunrise-replica`                                              |
| Password authentication and TLS | `SUNRISE_REDIS_PASSWORD='local-test-password' docker compose -f compose.yaml -f compose.redis-tls.yaml --profile replica up -d --force-recreate redis sunrise sunrise-replica` |

The TLS override creates a disposable local CA and server certificate in a
named volume. Remove that test material with:

```bash
docker compose -f compose.yaml -f compose.redis-tls.yaml --profile replica down -v
```

Production should provide `SUNRISE_REDIS_URL=rediss://...`, optional
`SUNRISE_REDIS_USERNAME`, required `SUNRISE_REDIS_PASSWORD`, and an optional
`SUNRISE_REDIS_CA_FILE` mounted from deployment secrets when private PKI is in
use. Do not reuse the Compose-generated CA. Authentication alone does not
encrypt traffic, while TLS without authentication does not authorize clients;
use both, network isolation, and a narrowly scoped ACL for production.

Sunrise is available at [http://localhost:9990](http://localhost:9990).
`/healthz` checks only the application process; `/readyz` checks Redis when
server-side sessions require it. The readiness probe performs short-lived Lua
writes across the session and refresh namespaces and samples Redis `TIME`, so
read-only endpoints and ACLs missing required data or shared-clock commands
remove the replica from service instead of accepting traffic it cannot handle.

Run the repeatable local probe baseline after the stack becomes healthy:

```bash
pnpm measure:compose
docker image inspect sunrise:local --format '{{.Size}} bytes'
docker stats --no-stream sunrise-local-sunrise-1 sunrise-local-redis-1
```

Start a second independent Sunrise process against the same Redis sessions
with:

```bash
docker compose --profile replica up -d sunrise-replica
```

Replica 2 is available at `http://localhost:9991`. Browser cookies are scoped
to `localhost`, not its port, so switching between ports exercises the same
opaque session through two processes without load-balancer affinity.

Stop and remove the local stack with `docker compose down`. The Compose Redis
data directory is deliberately ephemeral: it models a disposable local QA
dependency, not a production data policy. Production deployments must provide
an authenticated, highly available Redis endpoint (preferably `rediss://`),
shared `SUNRISE_SESSION_SECRET`, stable deployment namespace, and one immutable
`SUNRISE_DEPLOYMENT_ID` per image build.

Sunrise currently connects to one stable writable Redis endpoint. That endpoint
may be provided by a managed service, a Kubernetes operator, or a Sentinel
deployment that exposes the elected primary through stable DNS. Do not point
`SUNRISE_REDIS_URL` at a Sentinel port. Native Sentinel discovery and Redis
Cluster sharding remain separate deployment features; neither is required for
the expected session workload, and neither is enabled by this local Compose
topology.

For production sessions, high availability alone is not the whole contract:
the selected Redis service must provide acceptable durability for login, token
rotation, and logout-revocation writes. Losing a recent session revocation has
security consequences and must be covered by failover testing.

Redis is deliberately limited to security-bearing session state in this
iteration. Sunrise's OpenStack requests are non-cacheable, so each replica uses
Next.js's local server cache rather than maintaining a custom distributed cache
and tag-invalidation protocol. Revisit shared application caching only when a
measured cacheable workload justifies that separate consistency boundary.

Set `SUNRISE_SESSION_BACKEND=cookie` to use the single-process development
fallback. That mode is not suitable for horizontally scaled production
replicas because credential rotation and logout state are held by the browser.
Switching an existing deployment from `cookie` to `redis` intentionally
invalidates credential-bearing cookie sessions and requires users to sign in
again. This ensures every accepted authenticated session has a server-side,
revocable identity before its credentials are used.
