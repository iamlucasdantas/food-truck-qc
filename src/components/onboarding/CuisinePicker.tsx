import { useState } from "react";

export const CUISINES = [
  { name: "Tacos", icon: "🌮" }, { name: "BBQ", icon: "🍖" }, { name: "Burgers", icon: "🍔" },
  { name: "Pizza", icon: "🍕" }, { name: "Asian", icon: "🍜" }, { name: "Dessert", icon: "🍦" },
  { name: "Coffee", icon: "☕" }, { name: "Sandwiches", icon: "🥪" }, { name: "Seafood", icon: "🦐" },
  { name: "Vegan", icon: "🥗" }, { name: "Breakfast", icon: "🍳" }, { name: "Other", icon: "🍽️" },
] as const;

/** Cuisine picker with icons; "Other" reveals a free-text field. */
export function CuisinePicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | undefined }) {
  const isPreset = CUISINES.some((c) => c.name === value);
  const [custom, setCustom] = useState(value && !isPreset ? value : "");
  const showCustom = value === "Other" || (!isPreset && value !== "");
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">What kind of food do you serve?</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {CUISINES.map((c) => {
          const on = value === c.name || (c.name === "Other" && showCustom);
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => onChange(c.name)}
              aria-pressed={on}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                on ? "border-primary bg-accent" : "border-input bg-card hover:bg-muted"
              }`}
            >
              <span className="text-xl" aria-hidden>{c.icon}</span>{c.name}
            </button>
          );
        })}
      </div>
      {showCustom && (
        <input
          className="field w-full text-base font-normal"
          placeholder="e.g. Filipino fusion"
          value={custom}
          onChange={(e) => { setCustom(e.target.value); onChange(e.target.value || "Other"); }}
          aria-label="Describe your cuisine"
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
