export function configured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.APP_ORIGIN);
}
export function settings() {
  if (!configured()) throw new Error('Secure test setup is not complete.');
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const origin = new URL(process.env.APP_ORIGIN!).origin;
  if (url.protocol !== 'https:') throw new Error('Supabase must use HTTPS.');
  if (!origin.startsWith('https://') && !origin.startsWith('http://localhost:')) throw new Error('APP_ORIGIN must use HTTPS.');
  return { url:url.origin, key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, origin,
    resource:origin+'/api/secure-mcp', clientId:process.env.MCP_OAUTH_CLIENT_ID || '' };
}
export function safeNext(value:unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/dashboard';
  const parsed=new URL(value,'https://local.invalid');
  return parsed.origin==='https://local.invalid' && ['/dashboard','/oauth/consent'].includes(parsed.pathname) ? parsed.pathname+parsed.search : '/dashboard';
}
