import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";
export function useProfileLibrary() {
  const { user } = useAuth(); const qc = useQueryClient();
  const key = ["me", "profile-library", user?.id];
  const query = useQuery({queryKey:key, enabled:!!user, queryFn:async()=>{
    if(!user)return [];
    const {data,error}=await supabase.from("profile_trucks").select("*").eq("user_id",user.id);
    if(error)throw error;return data;
  }});
  const mutation=useMutation({mutationFn:async ({truckId,patch}:{truckId:string;patch:Partial<TablesInsert<"profile_trucks">>})=>{
    if(!user)throw new Error("Please sign in.");
    const {error}=await supabase.from("profile_trucks").upsert({...patch,user_id:user.id,truck_id:truckId},{onConflict:"user_id,truck_id"});
    if(error)throw error;
  },onSuccess:()=>void qc.invalidateQueries({queryKey:key}),onError:()=>toast.error("Couldn't save. Please try again.")});
  const recordView = useCallback((truckId:string) => { if(user) mutation.mutate({truckId,patch:{viewed_at:new Date().toISOString()}}); }, [user?.id, mutation.mutate]);
  return {...query,rows:query.data??[],recordView,update:mutation.mutate,busy:mutation.isPending};
}