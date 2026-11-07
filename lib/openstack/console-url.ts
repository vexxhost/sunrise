export function toNoVncWebSocketUrl(consolePageUrl: string): string {
  const pageUrl = new URL(consolePageUrl);
  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
    throw new Error("Nova returned an unsupported VNC console URL");
  }

  const webSocketProtocol = pageUrl.protocol === "https:" ? "wss:" : "ws:";
  const host = pageUrl.searchParams.get("host");
  const port = pageUrl.searchParams.get("port");
  const path = pageUrl.searchParams.get("path") ?? "websockify";

  let webSocketUrl: URL;
  if (host) {
    webSocketUrl = new URL(`https://${host}`);
    webSocketUrl.protocol = webSocketProtocol;
    if (port) webSocketUrl.port = port;
    webSocketUrl = new URL(`./${path}`, webSocketUrl);
  } else {
    webSocketUrl = new URL(path, pageUrl);
    webSocketUrl.protocol = webSocketProtocol;
  }

  return webSocketUrl.toString();
}
