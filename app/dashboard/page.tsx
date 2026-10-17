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
  return <main><header><span className="brand">PHQ</span><span>PRODUCTION HQ<small>Private production board · {data.user.email}</small></span></header>
    <h1>Your production board.</h1>
    {member ? <><p className="intro">Open a job to view its stages, materials and notes. Review each change before saving.</p>
      <iframe title="Production jobs and subtasks" src="/production-board.html?surface=website" style={{height:1100}}/>
      <details><summary>Connection test</summary><iframe title="Private saved test job" src="/saved-test.html?surface=website" style={{height:510}}/></details></>
      : <section><h2>Access has not been granted</h2><p>Your account must be added to the private test membership list before job data is available.</p></section>}
    <form action={logout}><button type="submit" className="signout">Sign out</button></form>
  </main>;
}
