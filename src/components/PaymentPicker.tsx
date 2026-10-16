import { PAYMENT_METHODS } from "@/data/trucks";

/** Checkbox chips for accepted payment methods plus a free "other" field. */
export function PaymentPicker({ value, other, onChange, idPrefix }: { value: string[]; other: string; onChange: (v: string[], other: string) => void; idPrefix: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PAYMENT_METHODS.map((m) => {
          const on = value.includes(m);
          return (
            <label key={m} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-2 px-3 text-sm font-medium ${on ? "border-primary bg-accent" : "border-input bg-card"}`}>
              <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== m) : [...value, m], other)} />{m}
            </label>
          );
        })}
      </div>
      <label className="block space-y-1 text-sm font-semibold" htmlFor={`${idPrefix}-other`}>Other (optional)
        <input id={`${idPrefix}-other`} className="field w-full text-base font-normal" placeholder="e.g. Bitcoin, checks" value={other} onChange={(e) => onChange(value, e.target.value)} />
      </label>
    </div>
  );
}
