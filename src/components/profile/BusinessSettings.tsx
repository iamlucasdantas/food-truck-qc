import { useBlocker } from "@tanstack/react-router";
import { useTruckPhotos } from "@/lib/photos";
import { OwnerPhotos } from "@/components/OwnerPhotos";
import { useState } from "react";
import { useMutation,useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Business,Truck } from "@/data/trucks";
import { LiveTruckPreview } from "@/components/onboarding/LiveTruckPreview";
import { PaymentPicker } from "@/components/PaymentPicker";
import { AvatarEditor } from "./AvatarEditor";
import { Section } from "./shared";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function BusinessSettings({ business,userId,truck }: { business: Business|null|undefined;userId:string;truck?:Truck | undefined }) {
  const [f,setF]=useState({name:business?.name??"",description:business?.description??"",logo_url:business?.logo_url??null,website:business?.website??"",instagram:business?.instagram??"",facebook:business?.facebook??"",reddit:business?.reddit??"",payment_methods:business?.payment_methods??[],payment_other:business?.payment_other??""});
  const {data:photos=[]}=useTruckPhotos(truck?.id);
  const [baseline,setBaseline]=useState(f);const dirty=JSON.stringify(baseline)!==JSON.stringify(f);
  useBlocker({shouldBlockFn:()=>dirty&&!window.confirm("Leave without saving business changes?"),enableBeforeUnload:dirty});
  const qc=useQueryClient();const save=useMutation({mutationFn:async()=>{if(!f.name.trim())throw new Error("Add a business name.");const {error}=await supabase.from("businesses").upsert({...f,owner_id:userId,updated_at:new Date().toISOString()});if(error)throw error;},onSuccess:()=>{setBaseline(f);void qc.invalidateQueries({queryKey:["business"]});void qc.invalidateQueries({queryKey:["truck"]});toast.success("Business saved");},onError:e=>toast.error(e.message)});
  return <Section title="Business profile" subtitle="Shared across all your trucks."><div className="grid items-start gap-6 lg:grid-cols-2"><form className="space-y-4" onSubmit={e=>{e.preventDefault();save.mutate();}}><AvatarEditor value={f.logo_url} initials={f.name.slice(0,2).toUpperCase()||"QC"} onChange={logo_url=>setF({...f,logo_url})}/>{([['name','Business name'],['website','Website'],['instagram','Instagram'],['facebook','Facebook'],['reddit','Reddit']] as const).map(([k,label])=><label key={k} className="block space-y-1 text-sm font-medium">{label}<input className="field" value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></label>)}<label className="block space-y-1 text-sm font-medium">Description<textarea className="field" rows={4} value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></label><PaymentPicker idPrefix="profile-business" value={f.payment_methods} other={f.payment_other} onChange={(payment_methods,payment_other)=>setF({...f,payment_methods,payment_other})}/><Button disabled={save.isPending}>{save.isPending?"Saving…":"Save business"}</Button></form><LiveTruckPreview d={{truckName:truck?.name??f.name,businessName:f.name,cuisine:truck?.category??"",description:f.description,logoUrl:f.logo_url,coverUrl:photos[0]?.url??null,paymentMethods:f.payment_methods}}/></div>{truck&&<OwnerPhotos truckId={truck.id}/ >}{dirty&&<div className="sticky bottom-20 flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 shadow-pop md:bottom-4"><span className="text-sm">Unsaved business changes</span><Button disabled={save.isPending} onClick={()=>save.mutate()}>Save business</Button></div>}</Section>;
}