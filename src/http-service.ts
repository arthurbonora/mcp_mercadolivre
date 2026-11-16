import { createServer } from "node:http";
import { writeSync } from "node:fs";
import { readSingleMessage, RequestBoundaryError } from "./http-boundary.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { HttpConfig } from "./http-auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
type ManagedServer = McpServer & { drainAndClose(): Promise<void> };
export function createHttpService(config: HttpConfig, verify: (token: string) => Promise<AuthInfo>, createMeliServer: () => ManagedServer, options: { deadlineMs?: number } = {}) {
const origin = new URL(config.resource).origin;
const metadataPath = "/.well-known/oauth-protected-resource/mcp";
let busy = false;
const http = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const end = (status: number) => { res.writeHead(status); res.end(); };
  if (req.headers.host !== new URL(config.resource).host || (req.headers.origin && req.headers.origin !== origin)) return end(403);
  if (req.url === metadataPath && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ resource: config.resource, authorization_servers: [config.issuer], scopes_supported: [config.scope], bearer_methods_supported: ["header"] }));
    return;
  }
  if (req.url !== "/mcp") return end(404);
  const authorization = req.headers.authorization;
  let auth;
  try {
    if (!authorization?.startsWith("Bearer ") || req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === "authorization").length !== 1) throw new Error();
    auth = await verify(authorization.slice(7));
  } catch {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${origin}${metadataPath}"`);
    return end(401);
  }
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return end(405); }
  if (!req.headers["content-type"]?.toLowerCase().startsWith("application/json")) return end(415);
  if (busy) { res.setHeader("Retry-After", "1"); return end(429); }
  busy = true;
  // A request or cleanup that exceeds the deadline terminates this process.
  // Closing the HTTP response alone does NOT cancel SDK handlers. Do not release
  // the lock and accept new requests while an old seller operation may survive.
  const deadline = setTimeout(() => { res.destroy(); http.close(); writeSync(2, "MCP_EXECUTION_DEADLINE\n"); process.exit(70); }, options.deadlineMs ?? 45000);
  // Serialize seller calls to avoid concurrent OAuth refresh/token-store races.
  let server: ReturnType<typeof createMeliServer> | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
  try {
  const message = await readSingleMessage(req);
  server = createMeliServer();
  transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536, enableDnsRebindingProtection: true, allowedHosts: [new URL(config.resource).host], allowedOrigins: [origin] });
    await server.connect(transport);
    await transport.handleRequest(Object.assign(req, { auth }), res, message);
  } catch (err) {
    if (!res.headersSent) { res.setHeader("Connection", "close"); end(err instanceof RequestBoundaryError ? err.status : 500); }
    else res.end();
  }
  finally {
    try { await server?.drainAndClose(); await transport?.close(); } catch { /* Do not log tokens or request bodies. */ }
    clearTimeout(deadline);
    busy = false;
  }
});
http.headersTimeout = 10000;
http.requestTimeout = 30000;
http.maxHeadersCount = 32;
return http;
}
