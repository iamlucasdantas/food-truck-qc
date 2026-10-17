import { useQuery } from "@tanstack/react-query";
import { RefreshCw, PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ListSkeleton, SectionHeader, StatusPill, btn } from "./ui";

/** Last 200 calls to the HighLevel chat/voice agent API (key is never stored). */
export function AgentApiLog() {
  const q = useQuery({
    queryKey: ["admin", "chat_api_logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_api_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });
  return (
    <>
      <SectionHeader title="Agent API log" description="Every call from the HighLevel chat and voice agents. The key itself is never saved." />
      <div className="mb-3 flex justify-end">
        <button className={btn.secondary} onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>
      {q.isLoading ? <ListSkeleton /> : !q.data?.length ? (
        <EmptyState icon={PhoneCall} title="No agent calls yet" hint="Calls appear here as soon as an agent asks for trucks." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="p-2">Time (Chicago)</th><th className="p-2">Endpoint</th><th className="p-2">Status</th><th className="p-2">Key</th><th className="p-2">Params</th><th className="p-2">Error</th><th className="p-2">User agent</th></tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap p-2">{new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}</td>
                  <td className="whitespace-nowrap p-2">{r.method} {r.endpoint}</td>
                  <td className="p-2"><StatusPill tone={r.status < 300 ? "success" : r.status < 500 ? "warning" : "danger"}>{r.status}</StatusPill></td>
                  <td className="whitespace-nowrap p-2">{r.auth_ok ? "ok" : r.auth_detail ?? "no"}</td>
                  <td className="max-w-xs p-2 font-mono text-xs break-all">{JSON.stringify(r.params)}</td>
                  <td className="max-w-xs p-2 text-xs text-destructive">{r.error}</td>
                  <td className="max-w-[12rem] truncate p-2 text-xs text-muted-foreground" title={r.user_agent ?? ""}>{r.user_agent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
