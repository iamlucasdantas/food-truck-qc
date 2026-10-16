import { Link } from "@tanstack/react-router";

/** "Pin Truck" brand mark — viewBox 0 0 100 124. variant: color | white | small (no awning/window, for <32px). */
export function LogoMark({ variant = "color", className = "h-8 w-auto" }: { variant?: "color" | "white" | "small"; className?: string }) {
  const fg = variant === "white" ? "currentColor" : "var(--primary)";
  const bg = variant === "white" ? "var(--primary)" : "#fff";
  const small = variant === "small";
  return (
    <svg viewBox="0 0 100 124" className={className} aria-hidden="true" style={variant === "white" ? { color: "#fff" } : undefined}>
      <path d="M50 2C25 2 6 21 6 46c0 32 44 76 44 76s44-44 44-76C94 21 75 2 50 2z" fill={fg} />
      <circle cx="50" cy="46" r="30" fill={bg} />
      <g transform="translate(28 30) scale(.72)" fill={fg}>
        {!small && <rect x="4" y="2" width="36" height="7" rx="3.5" />}
        {!small && <rect x="13" y="2" width="4" height="7" fill={bg} />}
        {!small && <rect x="24" y="2" width="4" height="7" fill={bg} />}
        <rect x="2" y="9" width="42" height="22" rx="4" />
        <path d="M44 15h9a4 4 0 0 1 3 1.4l6 7.2a4 4 0 0 1 1 2.6V31H44z" />
        <circle cx="14" cy="33" r="6" /><circle cx="50" cy="33" r="6" />
        <circle cx="14" cy="33" r="2.5" fill={bg} /><circle cx="50" cy="33" r="2.5" fill={bg} />
        {!small && <rect x="10" y="14" width="14" height="9" rx="2" fill={bg} />}
      </g>
    </svg>
  );
}

export function Wordmark({ className = "text-xl" }: { className?: string }) {
  return <span className={`font-extrabold tracking-[-0.025em] text-foreground ${className}`}><span className="text-primary">FoodTruck</span>QC</span>;
}

/** Horizontal lockup: symbol left + wordmark. Links home. */
export function Logo({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const mark = size === "sm" ? "h-6" : size === "lg" ? "h-10" : "h-8";
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-xl";
  return (
    <Link to="/" aria-label="FoodTruckQC home" className={`inline-flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}>
      <LogoMark className={`${mark} w-auto`} variant={size === "sm" ? "small" : "color"} />
      <Wordmark className={text} />
    </Link>
  );
}
