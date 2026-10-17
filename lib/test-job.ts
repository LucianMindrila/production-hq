export const RESOURCE_URI = 'ui://production-hq/rendering-test-v1.html';
export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';
export function previewJob(complete = false) {
  return {
    jobId: 'DEMO-001', title: 'Connection check', complete,
    stageTitle: 'Confirm the interactive checkbox works',
    persisted: false,
    message: 'Preview only. No job data was saved.',
  };
}
