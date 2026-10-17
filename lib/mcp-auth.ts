import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import { settings } from './config';

const keysets=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
export function checkMcpClaims(payload:JWTPayload,c:{resource:string;clientId:string}) {
  const permissions=payload.phq_permissions;
  if(!c.clientId || payload.client_id!==c.clientId || payload.resource!==c.resource || payload.role!=='authenticated'
    || typeof payload.sub!=='string' || !/^[0-9a-f-]{36}$/i.test(payload.sub)
    || !Array.isArray(permissions) || !['jobs:read','jobs:write'].every(p=>permissions.includes(p))) {
    throw new Error('Token is not authorized for Production HQ.');
  }
}
export async function verifyMcpToken(token:string,c:{url:string;resource:string;clientId:string},keys?:JWTVerifyGetKey) {
  if(!keys) {
    if(!keysets.has(c.url)) keysets.set(c.url,createRemoteJWKSet(new URL(c.url+'/auth/v1/.well-known/jwks.json')));
    keys=keysets.get(c.url)!;
  }
  const {payload}=await jwtVerify(token,keys,{issuer:c.url+'/auth/v1',audience:'authenticated',algorithms:['ES256','RS256'],requiredClaims:['sub','exp','iat'],clockTolerance:5});
  checkMcpClaims(payload,c);
  return payload;
}
export function challenge() {
  return `Bearer resource_metadata="${settings().origin}/.well-known/oauth-protected-resource", error="invalid_token"`;
}
