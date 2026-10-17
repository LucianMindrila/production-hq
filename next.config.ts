import type { NextConfig } from 'next';
const config: NextConfig = {
  outputFileTracingIncludes: { '/api/mcp': ['./public/test-job.html'], '/api/secure-mcp': ['./public/saved-test.html','./public/production-board.html'] },
};
export default config;
