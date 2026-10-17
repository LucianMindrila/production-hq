export default function Home() {
  return <main>
    <header><span className="brand">PHQ</span><span>PRODUCTION HQ <small>Connection laboratory</small></span></header>
    <p className="eyebrow">CHECKPOINT 01 · INTERACTIVE CARD</p>
    <h1>Let’s make the<br/>checkbox work.</h1>
    <p className="intro">This separate Vercel app tests the connection between ChatGPT and an interactive job card.</p>
    <iframe title="Interactive sample job" src="/test-job.html" />
    <section><h2>Test inside ChatGPT</h2><ol>
      <li>Add this deployment as a custom MCP server using <code>https://YOUR-DEPLOYMENT.vercel.app/api/mcp</code>.</li>
      <li>Select <strong>No authentication</strong> for this sample-only test.</li>
      <li>In a chat with the app enabled, ask <strong>“Show the Production HQ rendering test job.”</strong></li>
      <li>Tick the checkbox, then choose <strong>Test connection</strong>. Look for confirmation that the server received the change.</li>
    </ol><p>If the card cannot open, capture the error and inspect Vercel logs. Website rendering alone does not prove that the ChatGPT card works.</p></section>
    <footer>Sample data only · No permanent saving · No Google Sheets connection · No login configured</footer>
  </main>;
}
