// Stands in for `wxt/browser` when the side panel runs as a plain web page, so
// screenshots can be taken without loading the extension. Storage is in memory;
// runtime.sendMessage goes straight to the real background handlers.

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type Listener = (changes: Changes, area: string) => void;

const listeners = new Set<Listener>();
let dispatch: (msg: unknown) => Promise<unknown> = async () => {
  throw new Error('No dispatcher set');
};

export function setDispatch(fn: (msg: unknown) => Promise<unknown>): void {
  dispatch = fn;
}

function area(name: 'local' | 'session') {
  const data = new Map<string, unknown>();
  const copy = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  const emit = (changes: Changes) => setTimeout(() => listeners.forEach((l) => l(changes, name)));
  return {
    async get(keys?: string | string[] | null) {
      if (keys == null) return Object.fromEntries([...data].map(([k, v]) => [k, copy(v)]));
      const out: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) if (data.has(k)) out[k] = copy(data.get(k));
      return out;
    },
    async set(items: Record<string, unknown>) {
      const changes: Changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data.get(k), newValue: copy(v) };
        data.set(k, copy(v));
      }
      emit(changes);
    },
    async remove(keys: string | string[]) {
      const changes: Changes = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (data.delete(k)) changes[k] = { newValue: undefined };
      }
      emit(changes);
    },
    async clear() {
      const changes: Changes = Object.fromEntries([...data.keys()].map((k) => [k, { newValue: undefined }]));
      data.clear();
      emit(changes);
    },
  };
}

const noEvent = { addListener() {}, removeListener() {} };

export const browser = {
  storage: {
    local: area('local'),
    session: area('session'),
    onChanged: { addListener: (l: Listener) => listeners.add(l), removeListener: (l: Listener) => listeners.delete(l) },
  },
  runtime: {
    getManifest: () => ({ version: '1.0.0' }),
    getURL: (path: string) => path,
    async sendMessage(msg: unknown) {
      try {
        return { ok: true, value: await dispatch(msg) };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
    onMessage: noEvent,
  },
  tabs: {
    query: async () => [{ id: 1 }],
    getCurrent: async () => ({ id: 1 }),
    create: async () => ({}),
    onActivated: noEvent,
    async sendMessage() {},
  },
  windows: { onFocusChanged: noEvent },
  sidePanel: { open: async () => {} },
};

export type Browser = typeof browser;
