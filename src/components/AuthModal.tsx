import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuthForm } from "@/components/AuthForm";

export function AuthModal({ open, reason, onOpenChange }: { open: boolean; reason?: string | undefined; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[1200] max-h-[95dvh] max-w-sm overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Welcome to FoodTruckQC</DialogTitle>
          <DialogDescription>{reason ?? "Save your favorite food trucks and get alerts when they're open."}</DialogDescription>
        </DialogHeader>
        <AuthForm />
      </DialogContent>
    </Dialog>
  );
}
