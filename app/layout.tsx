import './style.css';
export const metadata = { title: 'Production HQ', description: 'Private production jobs, stages and materials.' };
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
