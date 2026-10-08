# Host browser and responsive control

This feature adapts the T3 research into the existing authenticated imc code Host.
It adds no alternate session engine, permissive CORS, cloud account, or persistent
browser credential storage. Web/mobile means a responsive browser interface, not
a native mobile package.

## Web control

Open the host's configured `/control` URL. Enter a previously paired device's
43-character credential from the existing host pairing workflow. The page keeps
it in memory only and clears it when disconnected. Never place credentials in
URLs, logs, bookmarks, or a reverse proxy configuration. Device revocation remains
the same host authority as desktop RPC.

The canonical origin must be explicitly configured by the host. Remote origins
require HTTPS; local `http://127.0.0.1:PORT` is supported. For LAN/Tailscale access,
configure a trusted HTTPS reverse proxy preserving the canonical Host header and
set `IMECE_WEB_CONTROL_ORIGIN` to its HTTPS origin. Do not expose a cleartext bearer
credential over a LAN. The server never trusts forwarded headers to infer origin.

Only POST `/control/rpc` with matching Origin, Host and JSON content type enters
the existing RPC switch. `/rpc` retains its native-only Origin restriction.
The page provides project/session lists, supervised new session creation, model
selection, prompt sending, stop, approval and question responses, bounded earlier
history, shared browser controls and diagnostics. It does not execute transcript
HTML. Rendered text uses textContent. CSP disallows framing and external scripts.

Session reads use bounded previews and partial deltas, pause while the document
is hidden, and never run overlapping polls. Earlier history opens a bounded page
rather than retaining an unbounded transcript. Provider state is not migrated.
Mutations are never automatically retried: if the response is uncertain, the page
retains the command ID and offers a receipt lookup before resending.

## Shared browser setup and ownership

Playwright is optional and loaded only on the first browser open. On the machine
running the host, explicitly install `playwright` into a runtime directory visible
to the host bundle's Node module resolver, then run `playwright install chromium`
from that environment. This task does not install or download either dependency.
If Playwright or Chromium is missing, opening reports a setup error. Packaged host
deployments need a supported runtime dependency location; do not edit the frozen
application package manually. Provision the runtime dependency with the deployment
pipeline before physical-device acceptance.

The host starts one headless ephemeral Chromium context at 1280×720. It does not
load the user's browser profile and disables downloads. Any authenticated device
may request a JPEG frame; a 30-second lease controls navigation, click, text,
supported keys, scroll and closing. It has one in-flight operation and a 2 MiB
frame budget. Control can be released or reclaimed after expiry. Idle Chromium
closes after five minutes; host shutdown also closes it. It is a shared browser,
so pages opened in it are visible to other authorized devices. This is not a video
stream or an automatic agent browser automation protocol.

## Diagnostics and acceptance

`resources.read` samples OS memory/load and the host Node process on demand, at
most once per second. It retains up to 60 samples and 64 KiB, limits active readers
to 32 with a 60-second TTL, and retains hashed reader identifiers. CPU excludes
provider subprocesses. Windows load average is reported as unavailable, not zero.
There is no background sampler or whole-system process enumeration.

The desktop panels mount only when selected. Browser frames and diagnostics
refresh explicitly. Live acceptance requires a paired remote browser, real
provider session including an approval/question, and Playwright/Chromium on the
target host. Source tests do not establish network, simulator, packaged Windows,
Mac, or installed mobile acceptance.

## Integration hooks

- Instantiate `WebControl(origin)`. Call `handle(request,response)` before the
  native RPC guard. Permit `acceptsRpc(request)` only as the narrow browser route
  exception; retain existing bearer authentication and post-body revocation checks.
- `ResourceDiagnostics.read(token)` handles `resources.read`;
  capability `resources.diagnostics`. Call `revoke(token)` on revocation and
  `close()` on shutdown.
- `SharedBrowser.dispatch(method,params,token)` handles `browser.status`, `.claim`,
  `.release`, `.open`, `.frame`, `.input`, `.close`; capability `browser.shared`.
  `revoke(token)` clears the lease and `close()` shuts down Chromium.
- Desktop `BrowserPanel` and `DiagnosticsPanel` take `{cwd}` and resolve only the
  owning host through `hostFeatureRequest`.
- Advertise the canonical control URL in authenticated host metadata so callers
  can show or copy a token-free link. Never embed the bearer credential.
