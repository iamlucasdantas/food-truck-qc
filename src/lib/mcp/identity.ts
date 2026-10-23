import type { ToolContext } from "@lovable.dev/mcp-js";

/** Identity for API-key MCP calls: a real session token minted for the key owner. */
export type KeyIdentity = { token: string; userId: string };

function keyIdentity(ctx: ToolContext): KeyIdentity | undefined {
  const app = (ctx as { appContext?: unknown }).appContext as Partial<KeyIdentity> | undefined;
  return app && typeof app.token === "string" && typeof app.userId === "string" ? (app as KeyIdentity) : undefined;
}

/** OAuth token first; otherwise the session minted for a verified API key. */
export const callerToken = (ctx: ToolContext) => ctx.getToken() ?? keyIdentity(ctx)?.token;
export const callerUserId = (ctx: ToolContext) => ctx.getUserId() ?? keyIdentity(ctx)?.userId;
