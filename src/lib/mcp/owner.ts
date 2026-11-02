import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";
import { callerUserId } from "./identity";
import { SIGN_IN_HINT, type OwnedTruck } from "@/data/owner-tools";

export const TRUCK_COLS = "id,name,business_name,category,truck_type,status,description,menu_summary,menu_sections,phone,website,instagram,facebook,base_address,base_lat,base_lng,claimed_by,created_by,created_at";

/** Owner tools run as the caller (RLS applies). Anonymous callers get the sign-in hint. */
export function ownerClient(ctx: ToolContext) {
  const uid = callerUserId(ctx);
  if (!uid) throw new ToolError(SIGN_IN_HINT);
  return { sb: supabaseForUser(ctx), uid };
}

export type MyTruck = OwnedTruck & {
  business_name: string; category: string; truck_type: string | null; description: string; menu_summary: string | null; menu_sections: unknown;
  phone: string | null; website: string | null; instagram: string | null; facebook: string | null; base_address: string | null; base_lat: number | null; base_lng: number | null; created_at: string;
};

/** Trucks the caller claimed or created (not deleted), oldest first. */
export async function myTrucks(sb: ReturnType<typeof supabaseForUser>, uid: string): Promise<MyTruck[]> {
  const { data, error } = await sb.from("trucks").select(TRUCK_COLS).or(`claimed_by.eq.${uid},created_by.eq.${uid}`).is("deleted_at", null).order("created_at");
  if (error) throw new ToolError(error.message);
  return (data ?? []) as unknown as MyTruck[];
}

export async function geocodeOrFail(address: string) {
  const { geocodeAddress } = await import("@/lib/geocode.server");
  return geocodeAddress(address).catch((e: unknown) => { throw new ToolError(e instanceof Error ? e.message : "Address lookup failed. Try a street address with the city."); });
}

export const reply = <T,>(text: string, data: T) => ({ content: [{ type: "text" as const, text }], structuredContent: data });
