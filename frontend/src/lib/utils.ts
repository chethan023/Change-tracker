import { format, formatDistanceToNow, parseISO } from "date-fns";
import type { ChangeElementType } from "./types";

/** Maps change element types to a visual category. */
export function changeTypeVariant(t: ChangeElementType): "add" | "remove" | "modify" | "move" {
  if (t.endsWith("_ADDED") || t.endsWith("_LINKED") || t === "PRODUCT_CREATED") return "add";
  if (t.endsWith("_REMOVED") || t.endsWith("_UNLINKED") || t === "PRODUCT_DELETED"
      || t.endsWith("_SUPPRESSED")) return "remove";
  if (t === "PRODUCT_RECLASSIFIED" || t === "PRODUCT_TYPE_CHANGED") return "move";
  return "modify";
}

export const variantClasses: Record<string, string> = {
  add:    "border-sage text-sage bg-sage-50",
  remove: "border-rose text-rose bg-rose-50",
  modify: "border-amber text-amber-900 bg-amber-50",
  move:   "border-brand text-brand bg-brand-50",
};

// Backend emits naive UTC timestamps (no "Z" suffix). parseISO would treat
// those as local time, so append "Z" when no timezone is present.
function asUtc(iso: string): string {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
}

/** Human-friendly relative time ("3 minutes ago") + absolute on hover. */
export function relTime(iso: string): string {
  try { return formatDistanceToNow(parseISO(asUtc(iso)), { addSuffix: true }); }
  catch { return iso; }
}

export function absTime(iso: string): string {
  try { return format(parseISO(asUtc(iso)), "yyyy-MM-dd HH:mm"); }
  catch { return iso; }
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Abbreviates long product/attribute IDs nicely. */
export function truncate(s: string | null | undefined, n = 40): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
