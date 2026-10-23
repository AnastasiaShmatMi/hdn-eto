const LIGHT_PUNCTUATION = /[.,?!;:…()[\]{}«»„“”‚‘’"'`‹›\-–—―/\\]/g;

export const WORD_BANK = [
  'воршип', 'кофе', 'молитва', 'домашка', 'голубь', 'дом',
  'альфа', 'пастор', 'ковер', 'библия', 'молодежка', 'семья', 'забота', 'работа',
];

export function usesBank(cells: string[]): boolean {
  return cells.length === 9 && cells.every((cell) => (
    WORD_BANK.some((word) => normalize(word) === normalize(cell))
  ));
}

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
