import { redirect } from 'next/navigation';
import { configured } from '../../lib/config';
import { sessionClient } from '../../lib/supabase';
import { requireMember } from '../../lib/saved-job';
import { logout } from '../login/actions';
export const dynamic='force-dynamic';
export default async function Dashboard() {
  if(!configured()) redirect('/login');
  const client=await sessionClient();const {data,error}=await client.auth.getUser();
  if(error || !data.user) redirect('/login');
  let member=true;try{await requireMember(client);}catch{member=false;}
  return <main><header><span className="brand">PHQ</span><span>PRODUCTION HQ<small>Private saved test · {data.user.email}</small></span></header>
    <h1>Your saved job.</h1>
    {member ? <><p className="intro">Tick the task, approve the change, then reopen this page to check that it stays saved.</p>
      <iframe title="Private saved test job" src="/saved-test.html?surface=website" style={{height:510}}/>
      <section><h2>Reopen test</h2><p>After a successful save, reload the page or open a fresh card in ChatGPT. It should show the same completion and revision.</p><p>This is a private test record. Google Sheets is not connected yet.</p></section></>
      : <section><h2>Access has not been granted</h2><p>Your account must be added to the private test membership list before job data is available.</p></section>}
    <form action={logout}><button type="submit" className="signout">Sign out</button></form>
  </main>;
}
