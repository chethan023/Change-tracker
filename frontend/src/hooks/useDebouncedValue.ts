import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (typically a search input) so downstream
 * effects — react-query refetches, URL syncs — don't fire on every keystroke.
 * 350 ms is the sweet spot: long enough to coalesce a typed word, short
 * enough that results feel live.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
