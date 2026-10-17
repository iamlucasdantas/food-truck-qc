import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Copy, Trash2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys.functions";
import { Section } from "./shared";
import { toast } from "sonner";

// Personal API keys for the public REST API (/api/public/v1/*). The full key
// is shown once at creation; only its hash is stored server-side.
export function ApiKeys() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApiKeys);
  const createFn = useServerFn(createApiKey);
  const revokeFn = useServerFn(revokeApiKey);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["me", "api-keys"],
    queryFn: () => listFn(),
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { label: label.trim() || "My app" } }),
    onSuccess: (data) => {
      setNewKey(data.key);
      setLabel("");
      void qc.invalidateQueries({ queryKey: ["me", "api-keys"] });
      toast.success("API key created — copy it now, it won't be shown again.");
    },
    onError: (e) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me", "api-keys"] });
      toast.success("API key revoked");
    },
    onError: (e) => toast.error(e.message),
  });

  async function copy() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the key and copy it manually.");
    }
  }

  return (
    <Section
      title="API keys"
      subtitle="Connect apps that can't sign in. Send the key as 'Authorization: Bearer ftqc_…' to /api/public/v1/trucks, /stops and /favorites."
    >
      {newKey && (
        <div className="rounded-lg border border-primary/40 bg-accent p-4">
          <p className="text-sm font-semibold">Your new key — shown only once</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-3 py-2 text-xs">{newKey}</code>
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button variant="ghost" className="mt-2" onClick={() => setNewKey(null)}>
            I've saved it
          </Button>
        </div>
      )}
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          className="field flex-1"
          aria-label="Key label"
          placeholder="Label, e.g. My Shortcut"
          maxLength={60}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button disabled={create.isPending}>
          <Plus />
          {create.isPending ? "Creating…" : "Create key"}
        </Button>
      </form>
      {isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : keys.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <KeyRound /> No API keys yet.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 p-4">
              <KeyRound className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{k.label}</p>
                <p className="text-xs text-muted-foreground">
                  {k.key_prefix}… · created {new Date(k.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : " · never used"}
                </p>
              </div>
              <Button
                variant="ghost"
                aria-label={`Revoke ${k.label}`}
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(k.id)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
