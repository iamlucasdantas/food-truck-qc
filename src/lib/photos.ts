import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PHOTO_BUCKET = "truck-photos";
export const MAX_PHOTOS = 12;
export type TruckPhoto = { id: string; path: string; position: number; is_cover: boolean; url: string };

/** Cover first, then by position. */
export function orderPhotos<T extends { position: number; is_cover: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position);
}

/** Photos for a truck with short-lived signed URLs (bucket is private-write, readable by anyone via signed links). */
export function useTruckPhotos(truckId: string | undefined) {
  return useQuery({
    queryKey: ["truck-photos", truckId],
    enabled: !!truckId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<TruckPhoto[]> => {
      const { data: rows } = await supabase.from("truck_photos").select("id, path, position, is_cover").eq("truck_id", truckId!).order("position");
      if (!rows?.length) return [];
      const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((r) => r.path), 60 * 60);
      const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
      return rows.map((r) => ({ ...r, url: byPath.get(r.path) ?? "" })).filter((r) => r.url);
    },
  });
}
