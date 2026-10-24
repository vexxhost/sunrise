# Sunrise Helm Chart

This chart runs Sunrise as a horizontally scalable, non-root, read-only
Kubernetes workload. Sessions are expected to use an external Redis-compatible
service so any replica can serve the next request.

## Configuration

The chart accepts native Kubernetes environment sources instead of imposing a
single Secret layout. Use exact Sunrise environment-variable names throughout.

Non-sensitive values may be stored in the chart-managed ConfigMap. Its rendered
content is checksummed into the pod template, so a Helm upgrade rolls the
Deployment whenever these values change.

```yaml
configMap:
  create: true
  data:
    SUNRISE_DASHBOARD_URL: https://sunrise.example.com
    SUNRISE_SESSION_BACKEND: redis
    SUNRISE_REDIS_URL: rediss://redis.example.com:6379
```

Use `envFrom` to load every key from externally managed Secrets or ConfigMaps:

```yaml
envFrom:
  - secretRef:
      name: sunrise-runtime
  - configMapRef:
      name: sunrise-platform
```

Use `env` when each setting has a different source or key. Literal entries are
also supported. Kubernetes gives explicit `env` entries precedence over keys
loaded with `envFrom`.

```yaml
env:
  - name: SUNRISE_SESSION_SECRET
    valueFrom:
      secretKeyRef:
        name: sunrise-session
        key: secret
  - name: SUNRISE_REDIS_URL
    valueFrom:
      secretKeyRef:
        name: sunrise-redis
        key: url
  - name: KEYSTONE_API
    valueFrom:
      configMapKeyRef:
        name: openstack-endpoints
        key: keystone-internal
```

For development or simple installations, the chart can create an Opaque
Secret. Values supplied this way are stored in the Helm release history, so
this is not the recommended production path.

```yaml
secret:
  create: true
  stringData:
    SUNRISE_SESSION_SECRET: replace-me
    SUNRISE_KEYCLOAK_CLIENT_SECRET_DEMO: replace-me
```

Set `configMap.name` or `secret.name` to control names of chart-managed
resources. Set `create: false` when another system owns them, then reference
those resources through `env` or `envFrom`.

## External Secrets and rollouts

External Secrets Operator can create the referenced runtime Secret without
placing sensitive values in Helm. This minimal example assumes the provider
and `ClusterSecretStore` already exist:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: sunrise-runtime
spec:
  refreshPolicy: Periodic
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: production
  target:
    name: sunrise-runtime
  dataFrom:
    - extract:
        key: sunrise/runtime
```

Environment variables sourced from a Secret or ConfigMap are read when a pod
starts. Kubernetes does not restart pods when those resources change. Install
[Stakater Reloader](https://github.com/stakater/Reloader) and set the following
to make referenced external resources trigger a rollout:

```yaml
reloader:
  enabled: true
```

This adds `reloader.stakater.com/auto: "true"` to the Deployment. The chart does
not install Reloader or External Secrets Operator. Arbitrary controller-specific
annotations can instead be supplied with `deploymentAnnotations`.

Cluster operators may select Reloader's `annotations` reload strategy to keep
its rollout marker out of the container environment. The local kind harness
uses this strategy.

The rollout behavior is therefore deterministic:

| Configuration owner | Rollout mechanism |
| --- | --- |
| Chart-managed ConfigMap | Pod-template checksum |
| Chart-managed Secret | Pod-template checksum |
| External Secret or ConfigMap | Reloader or another external controller |
| Individual `env.valueFrom` reference | Reloader or another external controller |

The Redis endpoint must be stable and writable. Production deployments should
use authentication and TLS. Native Sentinel discovery is not implemented; use
a managed or operator-provided writable service endpoint.

Use an immutable image digest or tag in production. The image build embeds the
Git revision as the Next.js deployment ID and OCI
`org.opencontainers.image.revision` label. It is image metadata, not a Helm
setting, so operators do not need to discover or duplicate it. Sunrise checks
the embedded metadata when each pod starts and reports it from `/healthz`.

## Probes and writable paths

`/healthz` is used for startup and liveness checks. `/readyz` verifies the
configured Redis dependency before the pod receives traffic. The root
filesystem is read-only; bounded `emptyDir` volumes provide `/tmp`, the Next.js
cache, and route cache.

## Gateway API

Set `httpRoute.enabled=true` to let the chart create an HTTPRoute. Existing
platform-managed routes can target the chart Service while leaving this option
disabled.

## Local kind environment

The repository's `deploy/k8s/kind` harness installs this chart with two Sunrise
replicas, Stakater Reloader, and a disposable password-protected Valkey
instance. The generated runtime Secret exercises the same external-resource
rollout path intended for operator-managed production secrets. Valkey is only
for local integration testing; production Redis remains an external dependency.

```bash
make -C deploy/k8s/kind sunrise
make -C deploy/k8s/kind sunrise-test
```

The default uses the published `ghcr.io/vexxhost/sunrise:main` image. To test a
locally built single-platform image without pulling it from a registry:

```bash
make -C deploy/k8s/kind sunrise \
  IMAGE_REPOSITORY=sunrise IMAGE_TAG=local \
  PULL_IMAGE=false LOAD_IMAGE=true
```
