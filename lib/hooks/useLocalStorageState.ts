"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function resolveDefault<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

export function useLocalStorageState<T>(
  key: string,
  defaultValue: T | (() => T),
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const getDefault = useMemo(() => () => resolveDefault(defaultValue), [defaultValue]);

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") {
      return getDefault();
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        return JSON.parse(raw) as T;
      }
    } catch {
      // ignore malformed values
    }
    return getDefault();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // silent storage failure (quota/private mode)
    }
  }, [key, state]);

  const update = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState(prev => (typeof value === "function" ? (value as (prev: T) => T)(prev) : value));
    },
    [],
  );

  const reset = useCallback(() => {
    const fallback = getDefault();
    setState(fallback);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [getDefault, key]);

  return [state, update, reset];
}
