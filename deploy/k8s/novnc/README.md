# Sunrise noVNC overlay

This Kustomize overlay adds a small Sunrise console page alongside the upstream
noVNC assets in `nova-novncproxy`. It does not replace `vnc.html` or
`vnc_lite.html`, so Horizon and Sunrise's **Open raw** action continue to use
the upstream client.

## Why the overlay exists

`sunrise.html` uses noVNC's existing `core/rfb.js` module and adds the minimal
bridge needed by the Sunrise console window for `Ctrl+Alt+Del` and reconnect
controls. The guest display is still the remote VNC canvas; none of these CSS
rules or fonts affect the guest operating system.

The three assets are intentionally small:

| File | Purpose |
| --- | --- |
| `sunrise.html` | CSP-friendly document shell. |
| `sunrise.css` | Black console surface, connection status, and local cursor fallback using system fonts. |
| `sunrise.js` | RFB initialization and the origin-checked `postMessage` bridge. |

The previous self-hosted Inter ConfigMap was removed. It consumed roughly 442
KiB to style only the brief connection status, required server-side apply, and
did not change the console canvas.

## Deploy

Apply the generated ConfigMap, patch the already deployed OpenStack-Helm
Deployment, and restart it so the init container copies the new assets:

```bash
kubectl apply -k .
kubectl -n openstack patch deployment nova-novncproxy \
  --patch-file ./deployment-patch.yaml
kubectl -n openstack rollout restart deployment/nova-novncproxy
kubectl -n openstack rollout status deployment/nova-novncproxy
```

The ConfigMap name is deliberately stable because this standalone directory
does not import the chart-owned Nova Deployment as a Kustomize resource. The
explicit rollout is therefore required after asset updates.

The deployment patch targets the `nova-novncproxy-init-assets` init container.
OpenStack-Helm populates a shared `EmptyDir` from `/usr/share/novnc`; mounting
the three files into that init container ensures they are copied into the
read-only asset volume served by the main proxy container.

## Dashboard origin

Sunrise appends its configured `DASHBOARD_URL` origin to each rewritten console
URL as `parentOrigin`. `sunrise.js` accepts bridge messages only when both the
message origin and source window match that value. There is no deployment-time
localhost allow-list to maintain.

The Nova console URL remains a privileged bearer URL. Do not log it or expose
it outside the active user session.

## Verify

```bash
kubectl -n openstack exec deploy/nova-novncproxy -- \
  ls /usr/share/novnc/sunrise.html \
     /usr/share/novnc/sunrise.css \
     /usr/share/novnc/sunrise.js \
     /usr/share/novnc/core/rfb.js
```

Opening `sunrise.html` without Nova's token query should render the connection
status and then report a failed connection. That confirms the assets are served;
an actual console must be opened through Sunrise or Nova so the short-lived
token and websocket path are present.

## Deployment assumptions

- The noVNC image stores assets at `/usr/share/novnc` and includes
  `/usr/share/novnc/core/rfb.js`.
- The proxy permits the Sunrise dashboard origin in `frame-ancestors` and does
  not send `X-Frame-Options: DENY`.
- A same-origin `script-src 'self'` policy is sufficient because no executable
  inline script remains. If the deployment sets stricter style rules,
  `sunrise.css` is also a same-origin external asset.
