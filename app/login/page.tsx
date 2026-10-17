import { configured, safeNext } from '../../lib/config';
import { login } from './actions';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{next?:string;error?:string}>}) {
  const params=await searchParams;
  return <main><header><span className="brand">PHQ</span><span>PRODUCTION HQ</span></header><h1>Sign in.</h1>
    {!configured() ? <section><h2>Private test setup is pending</h2><p>The login and database connection have not been configured yet. The sample rendering test is still available.</p></section> :
    <section><h2>Your private test job</h2><p>Use the account added by your project administrator.</p>
      {params.error && <p role="alert">Sign-in failed. Check your details and try again.</p>}
      <form action={login} className="login-form"><input type="hidden" name="next" value={safeNext(params.next)}/>
        <label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required/></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" maxLength={1024} required/></label>
        <button type="submit">Sign in</button>
      </form></section>}
  </main>;
}
