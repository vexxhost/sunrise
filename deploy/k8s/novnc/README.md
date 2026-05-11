# Sunrise noVNC overlay — Kubernetes manifests

These manifests deploy a patched `sunrise.html` page (and self-hosted Inter
font files) alongside the upstream noVNC assets in the `nova-novncproxy`
pod, **without** touching the original `vnc.html` / `vnc_lite.html` (so
Horizon and the Sunrise "Open raw" link still work).

## Files

| File | Purpose |
| --- | --- |
| `sunrise.html` | Custom RFB-only console page with `postMessage` bridge for `Ctrl+Alt+Del`, self-hosted Inter font, visible local cursor, and Sunrise branding. |
| `sunrise-novnc-cm.yaml` | ConfigMap wrapping `sunrise.html`. Regenerate from `sunrise.html` whenever you edit it (see below). |
| `sunrise-novnc-fonts-cm.yaml` | ConfigMap with the three Inter `.woff2` files (Regular / Medium / SemiBold) referenced by `sunrise.html` via `./fonts/Inter-*.woff2`. |
| `fonts/download.sh` | Fetches Inter `.woff2` files from the upstream rsms/inter release. |

## One-time setup

```bash
# 1. Fetch the Inter font files locally (writes ./fonts/Inter-*.woff2)
./fonts/download.sh
```

## Deploy / update

All commands assume namespace `openstack` and deployment `nova-novncproxy`.
Run them from inside `deploy/k8s/novnc/`.

```bash
# 1. (Re)generate the sunrise.html ConfigMap manifest
kubectl -n openstack create configmap sunrise-novnc \
  --from-file=sunrise.html=./sunrise.html \
  --dry-run=client -o yaml > sunrise-novnc-cm.yaml

# 2. (Re)generate the fonts ConfigMap manifest (binary woff2 -> binaryData)
kubectl -n openstack create configmap sunrise-novnc-fonts \
  --from-file=Inter-Regular.woff2=./fonts/Inter-Regular.woff2 \
  --from-file=Inter-Medium.woff2=./fonts/Inter-Medium.woff2 \
  --from-file=Inter-SemiBold.woff2=./fonts/Inter-SemiBold.woff2 \
  --dry-run=client -o yaml > sunrise-novnc-fonts-cm.yaml

# 3. Apply both ConfigMaps.
#    --server-side is REQUIRED for the fonts CM: it is larger than the
#    256 KiB limit on the `last-applied-configuration` annotation that
#    plain `kubectl apply` uses.
kubectl apply -f sunrise-novnc-cm.yaml
kubectl apply --server-side -f sunrise-novnc-fonts-cm.yaml

# 4. Patch the Deployment to mount both ConfigMaps (idempotent).
kubectl -n openstack patch deployment nova-novncproxy \
  --patch-file ./deployment-patch.yaml

# 5. Roll the pod so the new ConfigMap contents are picked up.
#    (Strategic-merge patches don't change the pod spec hash if the volume
#    definitions were already there from a previous patch, so an explicit
#    rollout is the reliable trigger.)
kubectl -n openstack rollout restart deployment nova-novncproxy
kubectl -n openstack rollout status  deployment nova-novncproxy
```

### Updating only `sunrise.html`

After the first install the volume mounts are in place; just rebuild and
re-apply the page ConfigMap, then roll the pod:

```bash
kubectl -n openstack create configmap sunrise-novnc \
  --from-file=sunrise.html=./sunrise.html \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n openstack rollout restart deployment nova-novncproxy
```

### Updating only the fonts

```bash
kubectl -n openstack create configmap sunrise-novnc-fonts \
  --from-file=Inter-Regular.woff2=./fonts/Inter-Regular.woff2 \
  --from-file=Inter-Medium.woff2=./fonts/Inter-Medium.woff2 \
  --from-file=Inter-SemiBold.woff2=./fonts/Inter-SemiBold.woff2 \
  --dry-run=client -o yaml | kubectl apply --server-side -f -

kubectl -n openstack rollout restart deployment nova-novncproxy
```

## Verify

```bash
# Confirm both files are mounted (upstream vnc.html should remain).
kubectl -n openstack exec deploy/nova-novncproxy -- ls /usr/share/novnc | grep -E '(vnc|sunrise)\.html'
kubectl -n openstack exec deploy/nova-novncproxy -- ls /usr/share/novnc/fonts

# Hit the page directly. With no token query you'll see the "Connection lost"
# overlay — that's expected and confirms sunrise.html is being served.
kubectl -n openstack port-forward deploy/nova-novncproxy 6080:6080
open http://localhost:6080/sunrise.html
```

## Allowed parent origins

`sunrise.html` reads its allowed origins from `<script data-parents="...">`.
The shipped value is `http://localhost:9990` — edit that attribute and
redeploy whenever you add a new dashboard origin.

## Caveats

- **Container path.** Default Kolla / openstack-helm images put noVNC at
  `/usr/share/novnc/`. If your image differs, update `mountPath` in
  `deployment-patch.yaml`.
- **`subPath` on `sunrise.html` is mandatory.** Without it the ConfigMap
  mount would replace the entire `/usr/share/novnc/` directory, deleting
  the upstream noVNC assets and breaking everything. The fonts mount uses
  a plain directory mount because `/usr/share/novnc/fonts/` does not
  exist upstream.
- **noVNC layout.** `sunrise.html` does `import RFB from "./core/rfb.js"`.
  Confirm `/usr/share/novnc/core/rfb.js` exists in your image; some
  bundled variants ship a single webpacked `app.js` and would need the
  import path adjusted.
- **Server-side apply for fonts.** `kubectl apply -f sunrise-novnc-fonts-cm.yaml`
  fails with `metadata.annotations: Too long: must have at most 262144 bytes`
  because the binary woff2 blobs exceed the 256 KiB annotation cap.
  Always use `--server-side` for that file.
- **Framing.** Your dashboard origin must be allowed by the proxy's
  `X-Frame-Options` / `Content-Security-Policy: frame-ancestors`.
  Without that the iframe stays blank.
- **CSP for inline module.** If the proxy enforces `script-src 'self'`,
  the inline `<script type="module">` in `sunrise.html` will be blocked.
  Either relax CSP for this file, or split the script out into a separate
  ConfigMap entry served as `sunrise.js`.
