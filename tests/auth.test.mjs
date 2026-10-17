import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair,exportJWK,createLocalJWKSet,SignJWT } from 'jose';
import { loadAuth } from './load-ts.mjs';

test('MCP tokens must have a valid signature, issuer, audience, expiry, client and resource binding',async()=>{
  const {auth}=await loadAuth();
  const {publicKey,privateKey}=await generateKeyPair('ES256');
  const jwk=await exportJWK(publicKey);jwk.kid='test-key';
  const keys=createLocalJWKSet({keys:[jwk]});
  const c={url:'https://example.supabase.co',resource:'https://production-hq-seven.vercel.app/api/secure-mcp',clientId:'registered-client'};
  const claims={sub:'11111111-1111-4111-8111-111111111111',role:'authenticated',client_id:c.clientId,resource:c.resource,phq_permissions:['jobs:read','jobs:write']};
  const sign=async (overrides={},key=privateKey)=>new SignJWT({...claims,...overrides}).setProtectedHeader({alg:'ES256',kid:'test-key'}).setIssuer(c.url+'/auth/v1').setAudience('authenticated').setIssuedAt().setExpirationTime('5m').sign(key);
  assert.equal((await auth.verifyMcpToken(await sign(),c,keys)).sub,claims.sub);
  for(const bad of [{client_id:'different-client'},{resource:'https://different.example/mcp'},{phq_permissions:['jobs:read']},{role:'anon'},{sub:'not-a-user'}]) {
    const token=await sign(bad);await assert.rejects(()=>auth.verifyMcpToken(token,c,keys));
  }
  const other=await generateKeyPair('ES256');await assert.rejects(()=>sign({},other.privateKey).then(t=>auth.verifyMcpToken(t,c,keys)));
  for(const [issuer,audience,expiry] of [['https://other.example','authenticated','5m'],[c.url+'/auth/v1','other-api','5m'],[c.url+'/auth/v1','authenticated',1]]) {
    const token=await new SignJWT(claims).setProtectedHeader({alg:'ES256',kid:'test-key'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
    await assert.rejects(()=>auth.verifyMcpToken(token,c,keys));
  }
});
test('login return paths stay on the app and within approved routes',async()=>{
  const {config}=await loadAuth();
  for(const bad of ['//evil.example','https://evil.example','/\\evil.example','/api/private/test-state','/dashboard\r\nX: y']) assert.equal(config.safeNext(bad),'/dashboard');
  assert.equal(config.safeNext('/oauth/consent?authorization_id=abc'),'/oauth/consent?authorization_id=abc');
});
