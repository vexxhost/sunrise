import { createServer } from "node:http";

const host = process.env.SUNRISE_E2E_IDENTITY_PROVIDER_HOST ?? "127.0.0.1";
const port = Number(process.env.SUNRISE_E2E_IDENTITY_PROVIDER_PORT ?? "18888");
const issuer = `http://${host}:${port}/realms/e2e`;

function send(response, status, contentType, body) {
  response.writeHead(status, { "content-type": contentType });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", issuer);

  if (url.pathname === "/realms/e2e/healthz") {
    send(response, 200, "text/plain; charset=utf-8", "ok");
    return;
  }

  if (url.pathname === "/realms/e2e/.well-known/openid-configuration") {
    send(
      response,
      200,
      "application/json; charset=utf-8",
      JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
        token_endpoint: `${issuer}/protocol/openid-connect/token`,
        end_session_endpoint: `${issuer}/protocol/openid-connect/logout`,
        userinfo_endpoint: `${issuer}/protocol/openid-connect/userinfo`,
      }),
    );
    return;
  }

  if (url.pathname === "/realms/e2e/protocol/openid-connect/auth") {
    send(
      response,
      200,
      "text/html; charset=utf-8",
      '<!doctype html><html lang="en"><title>Test identity provider</title><body><h1>Test identity provider</h1></body></html>',
    );
    return;
  }

  send(response, 404, "text/plain; charset=utf-8", "Not found");
});

server.listen(port, host);

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
