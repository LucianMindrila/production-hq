import type { NextConfig } from 'next';
const config: NextConfig = {
  outputFileTracingIncludes: { '/api/mcp': ['./public/test-job.html'] },
};
export default config;
