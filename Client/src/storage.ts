const ID_KEY = 'hdn-player-id';
const DRAFT_KEY = 'hdn-draft';
const PIN_KEY = 'hdn-host-pin';
const memory = new Map<string, string>();

function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function localSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `player-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function playerId(): string {
  const existing = localGet(ID_KEY);
  if (existing) return existing;
  const created = createId();
  localSet(ID_KEY, created);
  return created;
}

export function loadDraft(): { name: string; cells: string[] } {
  const blank = { name: '', cells: Array.from({ length: 9 }, () => '') };
  const raw = localGet(DRAFT_KEY);
  if (!raw) return blank;
  try {
    const data = JSON.parse(raw) as { name?: unknown; cells?: unknown };
    const cells = Array.isArray(data.cells) ? data.cells.slice(0, 9).map((cell) => String(cell ?? '')) : [];
    while (cells.length < 9) cells.push('');
    return { name: String(data.name ?? '').slice(0, 24), cells };
  } catch {
    return blank;
  }
}

export function saveDraft(draft: { name: string; cells: string[] }) {
  localSet(DRAFT_KEY, JSON.stringify({ name: draft.name, cells: draft.cells }));
}

export function loadPin(): string {
  try {
    return sessionStorage.getItem(PIN_KEY) ?? '';
  } catch {
    return memory.get(PIN_KEY) ?? '';
  }
}

export function savePin(pin: string) {
  try {
    sessionStorage.setItem(PIN_KEY, pin);
  } catch {
    memory.set(PIN_KEY, pin);
  }
}

export function clearPin() {
  try {
    sessionStorage.removeItem(PIN_KEY);
  } catch {
    memory.delete(PIN_KEY);
  }
}
