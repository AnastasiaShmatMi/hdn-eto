const LIGHT_PUNCTUATION = /[.,?!;:…()[\]{}«»„“”‚‘’"'`‹›\-–—―/\\]/g;

export type Phase = 'lobby' | 'live';

export type StoredPlayer = {
  id: string;
  name: string;
  cells: string[];
  joinedAt: number;
};

export type StoredCalled = {
  id: string;
  text: string;
  at: number;
};

export type StoredState = {
  phase: Phase;
  players: StoredPlayer[];
  called: StoredCalled[];
  revision: number;
};

export type PlayerView = {
  id: string;
  name: string;
  displayName: string;
  cells: string[];
  marks: boolean[];
  winning: boolean[];
  lines: string[];
  bingo: boolean;
  closest: number;
};

export type CloudWord = {
  text: string;
  count: number;
  called: boolean;
};

export const LINES = [
  { name: 'верхний ряд', cells: [0, 1, 2] },
  { name: 'средний ряд', cells: [3, 4, 5] },
  { name: 'нижний ряд', cells: [6, 7, 8] },
  { name: 'левый столбец', cells: [0, 3, 6] },
  { name: 'средний столбец', cells: [1, 4, 7] },
  { name: 'правый столбец', cells: [2, 5, 8] },
  { name: 'диагональ ↘', cells: [0, 4, 8] },
  { name: 'диагональ ↙', cells: [2, 4, 6] },
] as const;

export function normalize(value: string): string {
  return value
    .trim()
    .replace(/[\s\u00a0]+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(LIGHT_PUNCTUATION, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim();
}

export function cardCountText(count: number): string {
  return `${count} ${plural(count, 'карточка', 'карточки', 'карточек')}`;
}

export function calledOnCards(count: number): string {
  if (count === 0) return 'Ни на одной карточке.';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'карточке' : 'карточках';
  return `Есть на ${count} ${word}.`;
}

export function validateCard(
  name: unknown,
  cells: unknown,
): { ok: true; name: string; cells: string[] } | { ok: false; error: string } {
  if (typeof name !== 'string' || name.trim() === '') {
    return { ok: false, error: 'Напиши, как тебя зовут.' };
  }
  const cleanName = name.trim().replace(/[\s\u00a0]+/g, ' ');
  if ([...cleanName].length > 24) {
    return { ok: false, error: 'Имя длиннее 24 символов.' };
  }
  if (!Array.isArray(cells)) {
    return { ok: false, error: 'Заполни клетку 1.' };
  }
  const cleanCells: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < 9; index += 1) {
    const raw = cells[index];
    if (typeof raw !== 'string') {
      return { ok: false, error: `Заполни клетку ${index + 1}.` };
    }
    const text = raw.trim().replace(/[\s\u00a0]+/g, ' ');
    const key = normalize(text);
    if (!key) {
      return { ok: false, error: `Заполни клетку ${index + 1}.` };
    }
    if ([...text].length > 40) {
      return { ok: false, error: `Клетка ${index + 1} длиннее 40 символов.` };
    }
    if (seen.has(key)) {
      return { ok: false, error: `«${text}» повторяется. Все 9 слов должны быть разными.` };
    }
    seen.add(key);
    cleanCells.push(text);
  }
  return { ok: true, name: cleanName, cells: cleanCells };
}

export type Score = {
  marks: boolean[];
  winning: boolean[];
  lines: string[];
  bingo: boolean;
  closest: number;
};

export function evaluate(cells: string[], called: string[]): Score {
  const calledKeys = new Set(called.map((word) => normalize(word)).filter(Boolean));
  const marks = cells.map((cell) => {
    const key = normalize(cell);
    return key !== '' && calledKeys.has(key);
  });
  const lines: string[] = [];
  const winning = Array.from({ length: 9 }, () => false);
  let closest = 0;
  for (const line of LINES) {
    const hits = line.cells.filter((index) => marks[index]).length;
    if (hits > closest) closest = hits;
    if (hits === line.cells.length) {
      lines.push(line.name);
      for (const index of line.cells) winning[index] = true;
    }
  }
  return { marks, winning, lines, bingo: lines.length > 0, closest };
}

export function countCardsWith(players: StoredPlayer[], text: string): number {
  const key = normalize(text);
  if (!key) return 0;
  return players.filter((player) => player.cells.some((cell) => normalize(cell) === key)).length;
}

export function publicView(state: StoredState, playerId: string | undefined, joinUrl: string) {
  const players = presentPlayers(state);
  const player = playerId ? players.find((item) => item.id === playerId) ?? null : null;
  return {
    phase: state.phase,
    called: state.called,
    cardCount: state.players.length,
    cardCountText: cardCountText(state.players.length),
    joinUrl,
    revision: state.revision,
    player,
  };
}

export function hostView(state: StoredState, joinUrl: string) {
  return {
    phase: state.phase,
    called: state.called,
    cardCount: state.players.length,
    cardCountText: cardCountText(state.players.length),
    joinUrl,
    revision: state.revision,
    players: presentPlayers(state),
    cloud: wordCloud(state.players, state.called),
  };
}

function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function withDisplayNames(players: StoredPlayer[]): Array<StoredPlayer & { displayName: string }> {
  const groups = new Map<string, StoredPlayer[]>();
  for (const player of players) {
    const list = groups.get(player.name) ?? [];
    list.push(player);
    groups.set(player.name, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  }
  return players.map((player) => {
    const list = groups.get(player.name) ?? [player];
    const displayName = list.length === 1
      ? player.name
      : `${player.name} · ${list.findIndex((item) => item.id === player.id) + 1}`;
    return { ...player, displayName };
  });
}

function presentPlayers(state: StoredState): PlayerView[] {
  const calledTexts = state.called.map((item) => item.text);
  const views = withDisplayNames(state.players).map((player) => {
    const score = evaluate(player.cells, calledTexts);
    return {
      id: player.id,
      name: player.name,
      displayName: player.displayName,
      cells: player.cells,
      marks: score.marks,
      winning: score.winning,
      lines: score.lines,
      bingo: score.bingo,
      closest: score.closest,
    };
  });
  views.sort((a, b) => {
    if (a.bingo !== b.bingo) return a.bingo ? -1 : 1;
    if (a.closest !== b.closest) return b.closest - a.closest;
    return a.displayName.localeCompare(b.displayName, 'ru', { numeric: true });
  });
  return views;
}

function wordCloud(players: StoredPlayer[], called: StoredCalled[]): CloudWord[] {
  const groups = new Map<string, Map<string, number>>();
  for (const player of players) {
    const seen = new Set<string>();
    for (const cell of player.cells) {
      const key = normalize(cell);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const forms = groups.get(key) ?? new Map<string, number>();
      forms.set(cell, (forms.get(cell) ?? 0) + 1);
      groups.set(key, forms);
    }
  }
  const calledKeys = new Set(called.map((item) => normalize(item.text)).filter(Boolean));
  const items: CloudWord[] = [];
  for (const [key, forms] of groups) {
    let best = '';
    let bestCount = -1;
    for (const [form, count] of forms) {
      if (count > bestCount || (count === bestCount && form.localeCompare(best, 'ru') < 0)) {
        best = form;
        bestCount = count;
      }
    }
    let total = 0;
    for (const count of forms.values()) total += count;
    items.push({ text: best, count: total, called: calledKeys.has(key) });
  }
  items.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ru'));
  return items;
}
