import { redirect } from 'next/navigation';
import { configured } from '../../../lib/config';
import { sessionClient } from '../../../lib/supabase';
import { requireMember } from '../../../lib/saved-job';
export const dynamic='force-dynamic';
export default async function Consent({searchParams}:{searchParams:Promise<{authorization_id?:string}>}) {
  if(!configured()) redirect('/login');
  const id=(await searchParams).authorization_id;
  if(!id || id.length>512) return <main><h1>Invalid connection request.</h1></main>;
  const client=await sessionClient();const {data:user,error:userError}=await client.auth.getUser();
  if(userError || !user.user) redirect('/login?next='+encodeURIComponent('/oauth/consent?authorization_id='+encodeURIComponent(id)));
  try{await requireMember(client);}catch{return <main><h1>Access has not been granted.</h1><p>Your account is not on the private test membership list.</p></main>;}
  const {data,error}=await client.auth.oauth.getAuthorizationDetails(id);
  if(error || !data) return <main><h1>Connection request unavailable.</h1><p>Return to ChatGPT and start the connection again.</p></main>;
  if(!('authorization_id' in data)) redirect(data.redirect_url);
  return <main><header><span className="brand">PHQ</span><span>PRODUCTION HQ</span></header><h1>Connect your account.</h1><section>
    <h2>{data.client.name} requests access</h2><p>Signed in as {user.user.email}.</p>
    <p>This connection can read your private test job and save changes you approve. Every save records a revision and history entry.</p>
    <p>Requested identity scopes: {data.scope || 'None'}</p><p>Return address: <code>{data.redirect_uri}</code></p>
    <form action="/api/oauth/decision" method="post"><input type="hidden" name="authorization_id" value={id}/>
      <button name="decision" value="approve" type="submit">Approve connection</button>{' '}
      <button name="decision" value="deny" type="submit">Decline</button>
    </form></section></main>;
}
