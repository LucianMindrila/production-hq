import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { previewJob, RESOURCE_URI, RESOURCE_MIME_TYPE } from '../../../lib/test-job';

export const runtime = 'nodejs';
export const maxDuration = 30;
const outputSchema = z.object({
  jobId: z.string(), title: z.string(), complete: z.boolean(),
  stageTitle: z.string(), persisted: z.literal(false), message: z.string(),
});
const result = (complete = false) => ({
  content: [{ type: 'text' as const, text: 'Sample rendering test. Changes are previews and are not saved.' }],
  structuredContent: previewJob(complete),
});

const handler = createMcpHandler(server => {
  server.registerResource('production-hq-test-card', RESOURCE_URI, {
    title: 'Production HQ sample job', mimeType: RESOURCE_MIME_TYPE,
  }, async () => ({ contents: [{
    uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE,
    text: await readFile(path.join(process.cwd(), 'public/test-job.html'), 'utf8'),
    _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
  }] }));
  server.registerTool('show_rendering_test_job', {
    title: 'Show Production HQ rendering test job',
    description: 'Open the interactive sample job card. This is a rendering test with no real jobs or permanent storage.',
    inputSchema: z.object({}), outputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: RESOURCE_URI }, 'openai/outputTemplate': RESOURCE_URI },
  }, async () => result());
  server.registerTool('preview_test_completion', {
    title: 'Test checkbox connection',
    description: 'Echo a sample checkbox value back to the card to verify UI-to-server communication. Does not save anything.',
    inputSchema: z.object({ complete: z.boolean() }), outputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: RESOURCE_URI }, 'openai/widgetAccessible': true },
  }, async ({ complete }) => result(complete));
}, { serverInfo: { name: 'production-hq-rendering-test', version: '0.1.0' } });

export { handler as GET, handler as POST, handler as DELETE };
