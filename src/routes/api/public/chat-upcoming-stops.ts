import { createFileRoute } from '@tanstack/react-router';
const run = async (request: Request) => (await import('@/lib/chat-agent.server')).handleAgentRequest(request, 'chat-upcoming-stops', true);
export const Route = createFileRoute('/api/public/chat-upcoming-stops')({
  staticData: { sitemap: false },
  server: { handlers: {
    OPTIONS: async () => (await import('@/lib/chat-agent.server')).preflight(),
    GET: ({ request }) => run(request),
    POST: ({ request }) => run(request),
  } },
});
