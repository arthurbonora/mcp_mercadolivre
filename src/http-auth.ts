import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export interface HttpConfig { resource: string; issuer: string; jwks: string; subject: string; client: string; scope: string; port: number; }
function httpsUrl(value: string | undefined): string {
  if (!value) throw new Error("Missing OAuth deployment configuration");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Expected a clean HTTPS OAuth URL");
  return url.href;
}
export function readHttpConfig(env: NodeJS.ProcessEnv): HttpConfig {
  const resource = httpsUrl(env.MCP_RESOURCE_URL);
  if (new URL(resource).pathname !== "/mcp") throw new Error("Resource must end in /mcp");
  const issuer = httpsUrl(env.MCP_OAUTH_ISSUER);
  // Preserve issuer spelling: OAuth issuer comparison is exact, including trailing slash.
  const exactIssuer = env.MCP_OAUTH_ISSUER!;
  const jwks = httpsUrl(env.MCP_OAUTH_JWKS_URL);
  if (new URL(issuer).origin !== new URL(jwks).origin) throw new Error("JWKS must share the reviewed issuer origin");
  const subject = env.MCP_OAUTH_OWNER_SUB;
  const client = env.MCP_OAUTH_CLIENT_ID;
  if (!subject || !client) throw new Error("Owner subject and approved OAuth client are required");
  const port = Number(env.MCP_HTTP_PORT ?? "4611");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port");
  return { resource, issuer: exactIssuer, jwks, subject, client, scope: "mcp:read", port };
}
export function createVerifier(config: HttpConfig, key: JWTVerifyGetKey = createRemoteJWKSet(new URL(config.jwks), { timeoutDuration: 5000, cooldownDuration: 30000 })) {
  return async (token: string) => {
    if (token.length > 8192) throw new Error("Invalid token");
    const { payload } = await jwtVerify(token, key, {
      issuer: config.issuer, audience: config.resource, algorithms: ["RS256", "ES256"],
      typ: "at+jwt", requiredClaims: ["exp", "iat", "sub", "client_id"], maxTokenAge: "15m",
    });
    if (payload.sub !== config.subject || payload.client_id !== config.client) throw new Error("Principal not authorized");
    if (typeof payload.scope !== "string" || !payload.scope.split(" ").includes(config.scope)) throw new Error("Insufficient scope");
    return { token, clientId: config.client, scopes: payload.scope.split(" "), expiresAt: payload.exp!, resource: new URL(config.resource) };
  };
}
