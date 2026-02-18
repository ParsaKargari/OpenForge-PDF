import { useCallback, useEffect, useMemo, useState } from "react";

const isClient = typeof window !== "undefined";

function readFromStorage<T>(key: string, parse: (raw: string) => T | null): T | null {
  if (!isClient) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persist state in localStorage. Updates storage when value changes and
 * reads initial value from storage (or uses initialValue if missing/invalid).
 *
 * @param key - localStorage key
 * @param initialValue - used when storage is empty or parse fails
 * @param options.parse - custom parser (default: JSON.parse). Return null to use initialValue.
 * @param options.stringify - custom serializer (default: JSON.stringify for non-strings)
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options?: {
    parse?: (raw: string) => T | null;
    stringify?: (value: T) => string;
  },
): [T, (value: T | ((prev: T) => T)) => void] {
  const parse = options?.parse ?? ((raw: string) => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  });
  const stringify = useMemo(
    () =>
      options?.stringify ??
      ((value: T) =>
        typeof value === "string" ? value : JSON.stringify(value)),
    [options?.stringify],
  );

  const [state, setState] = useState<T>(() => {
    const stored = readFromStorage(key, parse);
    return stored !== null ? stored : initialValue;
  });

  useEffect(() => {
    const serialized = stringify(state);
    if (isClient) {
      try {
        localStorage.setItem(key, serialized);
      } catch {
        // ignore quota / privacy errors
      }
    }
  }, [key, state, stringify]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
        return next;
      });
    },
    [],
  );

  return [state, setValue];
}
