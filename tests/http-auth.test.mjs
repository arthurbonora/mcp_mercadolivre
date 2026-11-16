import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { readHttpConfig, createVerifier } from '../dist/http-auth.js';
const env = { MCP_RESOURCE_URL:'https://mcp.example.test/mcp', MCP_OAUTH_ISSUER:'https://auth.example.test', MCP_OAUTH_JWKS_URL:'https://auth.example.test/jwks', MCP_OAUTH_OWNER_SUB:'owner', MCP_OAUTH_CLIENT_ID:'approved-client' };
const config = readHttpConfig(env);
const { publicKey, privateKey } = await generateKeyPair('RS256');
const verify = createVerifier(config, async () => publicKey);
async function token(overrides = {}, typ = 'at+jwt') { return new SignJWT({ sub:'owner', client_id:'approved-client', scope:'mcp:read', ...overrides }).setProtectedHeader({alg:'RS256',typ}).setIssuedAt().setIssuer(config.issuer).setAudience(config.resource).setExpirationTime('5m').sign(privateKey); }
test('requires explicit trusted issuer and owner; no fallback', () => { assert.throws(() => readHttpConfig({})); assert.throws(() => readHttpConfig({...env,MCP_OAUTH_JWKS_URL:'https://evil.test/jwks'})); assert.throws(() => readHttpConfig({...env,MCP_OAUTH_OWNER_SUB:''})); });
test('accepts scoped approved owner access token',async()=>assert.equal((await verify(await token())).clientId,'approved-client'));
test('rejects other owners, clients and missing scope',async()=>{for(const v of [{sub:'other'},{client_id:'other'},{scope:''}]) await assert.rejects(verify(await token(v)));});
test('rejects ID tokens',async()=>assert.rejects(verify(await token({},'JWT'))));
test('rejects signature mismatch and malformed tokens',async()=>{const t=await token();await assert.rejects(verify(t.slice(0,-20)+'01234567890123456789'));await assert.rejects(verify('invalid'));});
test('rejects wrong issuer, audience and expiration',async()=>{for(const change of [s=>s.setIssuer('https://evil.test'),s=>s.setAudience('another-resource'),s=>s.setExpirationTime(1)]) {let s=new SignJWT({sub:'owner',client_id:'approved-client',scope:'mcp:read'}).setProtectedHeader({alg:'RS256',typ:'at+jwt'}).setIssuedAt().setIssuer(config.issuer).setAudience(config.resource).setExpirationTime('5m');await assert.rejects(verify(await change(s).sign(privateKey)));}});
