import './style.css';
export const metadata = { title: 'Production HQ · Rendering test', description: 'Independent ChatGPT job card test on Vercel.' };
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
