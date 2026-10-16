import { useQuery } from "@tanstack/react-query";
import { signTruckPhotos } from "@/lib/photos.functions";

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
    queryFn: async (): Promise<TruckPhoto[]> => signTruckPhotos({ data: { truckId: truckId! } }),
    },
  });
}
