# Candidate only: NOT approved for deployment

Base copied from local-hardening b06ef5a2cd02c59fd958e8c13a826e930faf1e69. No VPS, DNS, credentials, seller APIs or public listener used.

Changes: extract shared server factory; preserve stdio entry point; add separate stateless Streamable HTTP entry point bound only to 127.0.0.1. Enforce read-only, strict Host/Origin, 64 KiB bodies, MCP input-element limit inherited from factory, serial seller requests, JSON responses. RFC9728 protected-resource metadata advertises an explicitly configured external authorization server. It does NOT mint tokens or implement an issuer. JOSE verifies RS256/ES256 access-token signatures, exact issuer/audience, required expiration and issue time (15-minute maximum age), at+jwt type, owner subject, approved OAuth client_id and mcp:read scope. Remote JWKS is fixed at startup, issuer-origin restricted; JOSE uses manual redirects and timeout. No bearer credentials accepted in query strings. No permissive CORS.

Configuration (no real values guessed): MCP_RESOURCE_URL (HTTPS, /mcp), MCP_OAUTH_ISSUER, MCP_OAUTH_JWKS_URL, MCP_OAUTH_OWNER_SUB, MCP_OAUTH_CLIENT_ID; optional loopback port MCP_HTTP_PORT default4611. The external issuer must produce RFC9068-like access tokens with typ=at+jwt and client_id. An arbitrary ID token, ML OAuth token, Cloudflare service token or unrelated MCP token will NOT work.

PRODUCTION GATES:
1. Choose/verify actual external authorization server, supported OAuth authorization-code + S256 PKCE flow, secure owner login, client registration supported by ChatGPT, refresh/revocation and compatible resource/audience, exact JWT claim contract. No issuer has been established. This is NOT yet a functioning ChatGPT connector.
2. Independent code review + HTTP handler tests (host/origin, body cap, concurrency cleanup, cancellation) + local protocol client handshake tests. Auth tests are unit tests only.
3. Configure reverse proxy preserving public Host, denying unapproved origins, body/time/rate/connection limits. Public DNS/TLS/network settings require separate security confirmation. Loopback binding alone is not authentication.
4. Integration test real issuer with disposable tokens. No account credentials reused; no tokens/logs committed. Verify read-only tool list and Mercado Livre authorization separately.
5. Ensure one process writes seller token store. This HTTP process serializes calls, but another stdio process could still contend.

Deliberate limits: no OAuth issuer implementation, no dynamic client registration endpoint, no GET SSE stream, no sessions, no write-tools, no public production setup. At most one authenticated MCP call at a time, others receive429. For a private single-owner service this trades throughput for token refresh safety. Caller must retry429. Requiring at+jwt may rule out existing issuers; do not loosen without review.

Validation: TypeScript compilation passed; six crypto/config unit tests passed (owner/client/scope, ID-token rejection, signatures, issuer/audience/expiry, fail-closed configuration). No seller calls or live OAuth flows executed. Tests do not constitute production security clearance.

## Follow-up: batch/deadline correction
JSON-RPC arrays (including one-element batches) are rejected BEFORE SDK dispatch. Input is parsed once after authentication, actual and declared size capped at64KiB, content encoding disallowed, body read capped at5s. The shared factory tracks actual tool-handler promises and closes admissions before draining; HTTP busy lock remains held until handlers drain, even if the peer disconnects. Overall45s execution/cleanup watchdog fails closed by terminating this dedicated process rather than merely dropping an HTTP response and allowing old seller calls to overlap. Production needs supervisor restart; this availability tradeoff is deliberate. Deadline termination may interrupt a read/refresh, so atomic token persistence and integration recovery still require testing. Nine auth/boundary tests plus TypeScript compilation passed. Handler/deadline integration still requires independent review. No deployment performed.

## Isolated integration verification
Refactored HTTP service construction into `http-service.ts` (no account imports) and reusable `HandlerLifecycle` used by the real seller factory and test doubles. Tests open only ephemeral127.0.0.1 listeners with synthetic auth; they do not load seller credentials or contact seller/issuer APIs. Real installed MCP SDK dispatches calls into local fixture handlers.

Observed16/16 tests passing after TypeScript build:
- crypto/config and payload boundary9 cases;
- batch rejected without dispatch, pending handler serializes requests, disconnected client keeps lock until actual work finishes, rejected work drains and new work is refused;
- child process exits1 when handler hangs and when cleanup hangs;
- supervisor double relaunches two fresh isolated workers without inherited in-memory lock.

The last case is NOT a production supervisor/systemd validation. A real service must run one worker only, restart on failure with a delay and bounded restart burst (for example3 failures within5min) so recurring faults become an operator-visible stopped service rather than a credential-refresh retry storm. No service unit installed or production restart tested.

### Refresh-token rotation interruption recovery
The watchdog can kill a process after Mercado Livre accepts a refresh token and rotates it but before the new token is persisted. Atomic local writes protect file integrity, NOT this distributed gap. Neither the old token nor a local backup is guaranteed reusable. On `invalid_grant` after such interruption: stop repeated automatic refresh attempts, preserve the existing token file and sanitized failure timestamp, and require a fresh owner OAuth authorization if the provider rejects recovery. Never claim OAuth is connected until fresh access is verified; never log/replay old tokens or automatically fall back to another account. Restart limits only bound process crashes, not API-level retries; a real refresh circuit breaker and operational recovery verification remain production gates. Existing hardening token response validation is still required.

No deployment, public listener, DNS, account token, or actual OAuth issuer was used. This verification does not resolve the absent real OAuth provider or production supervisor gate.


## Watchdog evidence correction
Independent review found that exit1 alone could falsely pass on a fixture startup exception. Watchdog now emits only a static non-sensitive `MCP_EXECUTION_DEADLINE` diagnostic synchronously and exits with distinct code70. Tests await subprocess `close` (drained stdout/stderr), require exact handler-entry marker, cleanup-entry marker for cleanup case, exact deadline diagnostic and code70. Supervisor double verifies all markers on each worker. An injected startup exit1 is explicitly rejected by the test harness.19 tests plus compilation pass after correction. Earlier exit1-only watchdog observations were insufficient evidence and are superseded.
