import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/api/public/chat-upcoming-stops')({
  staticData: { sitemap: false },
  server: { handlers: {
    OPTIONS: async () => (await import('@/lib/chat-agent.server')).preflight(),
    GET: async ({ request }) => {
      const h = await import('@/lib/chat-agent.server');
      if (!(await h.authorized(request))) return h.unauthorized();
      const { SearchQuery, runSearch, agentResponse } = await import('@/lib/api-search.server');
      const p = SearchQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!p.success) return h.json({ error: 'invalid query' },400);
      const r = await runSearch(p.data,{days:3,limit:10,upcoming:true});
      if ('error' in r) return h.json(r,r.error === 'location not found' ? 400 : 500);
      return h.json(agentResponse(r,true));
    },
  } },
});
