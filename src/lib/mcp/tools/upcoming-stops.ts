import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';
import { AgentInputShape, runSearch, agentResponse } from '@/lib/api-search.server';
export default defineTool({
  name: 'upcoming_stops',
  title: 'Upcoming truck stops',
  description: 'Find approved Quad Cities food trucks by smart location, cuisine, published dishes and Central-time schedules including recurring stops.',
  inputSchema: {...AgentInputShape,open_now:z.boolean().optional(),lat:z.number().min(-90).max(90).optional(),lng:z.number().min(-180).max(180).optional(),radius_miles:z.number().min(1).max(100).optional(),days:z.number().int().min(1).max(14).optional(),limit:z.number().int().min(1).max(50).optional()},
  annotations: { readOnlyHint:true,idempotentHint:true,openWorldHint:false },
  handler: async (input,ctx) => {
    if ((input.lat == null) !== (input.lng == null)) throw new ToolError('Provide lat and lng together');
    const r = await runSearch(input,{days:3,limit:10,upcoming:true},supabaseForUser(ctx));
    if ('error' in r) throw new ToolError(r.error);
    const response = agentResponse(r,true);
    return {content:[{type:'text',text:JSON.stringify(response)}],structuredContent:response};
  },
});
