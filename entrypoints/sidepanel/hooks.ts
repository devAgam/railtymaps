import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { send, type Usage } from '../../lib/messages';
import { DEFAULT_SETTINGS } from '../../lib/storage';
import type { Settings } from '../../lib/types';

type Area = 'local' | 'session';
type Changes = Record<string, { newValue?: unknown }>;

/** A value in extension storage that re-renders on change. Returns [value, loaded]. */
export function useStored<T>(area: Area, key: string | null, fallback: T): [T, boolean] {
  const [state, setState] = useState<{ key: string | null; value: T; loaded: boolean }>({ key, value: fallback, loaded: false });

  useEffect(() => {
    if (!key) {
      setState({ key, value: fallback, loaded: true });
      return;
    }
    let alive = true;
    browser.storage[area].get(key).then((r) => {
      if (alive) setState({ key, value: (r[key] as T) ?? fallback, loaded: true });
    });
    const onChange = (changes: Changes, changedArea: string) => {
      if (changedArea === area && key in changes) setState({ key, value: (changes[key].newValue as T) ?? fallback, loaded: true });
    };
    browser.storage.onChanged.addListener(onChange);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(onChange);
    };
    // `fallback` is a literal at every call site; including it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, key]);

  return state.key === key ? [state.value, state.loaded] : [fallback, false];
}

export function useSettings(): [Settings, boolean] {
  const [stored, loaded] = useStored<Partial<Settings>>('local', 'settings', {});
  return [{ ...DEFAULT_SETTINGS, ...stored }, loaded];
}

/** The tab the side panel sits next to. */
export function useActiveTabId(): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => setId(t?.id ?? null));
    void refresh();
    const onChange = () => void refresh();
    browser.tabs.onActivated.addListener(onChange);
    browser.windows?.onFocusChanged.addListener(onChange);
    return () => {
      browser.tabs.onActivated.removeListener(onChange);
      browser.windows?.onFocusChanged.removeListener(onChange);
    };
  }, []);
  return id;
}

/** Bumps whenever a cached trip plan changes, so views can re-read exact times. */
export function usePlanCacheVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = (changes: Changes, area: string) => {
      if (area !== 'local' || !Object.keys(changes).some((k) => k.startsWith('plan:') || k === 'usage')) return;
      clearTimeout(timer);
      timer = setTimeout(() => setVersion((v) => v + 1), 300);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return version;
}

/** Trip searches used in the last 24 hours, refreshed as new ones happen. */
export function useUsage(): [Usage | null, () => void] {
  const [usage, setUsage] = useState<Usage | null>(null);
  const version = usePlanCacheVersion();
  const refresh = useCallback(() => {
    send({ type: 'usage' }).then(setUsage, () => {});
  }, []);
  useEffect(refresh, [refresh, version]);
  return [usage, refresh];
}
