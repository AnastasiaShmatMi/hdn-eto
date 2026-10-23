import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, fetchState, saveCard } from '../api';
import { Brand } from '../components/Brand';
import { WordGrid } from '../components/WordGrid';
import { useFresh } from '../fresh';
import { isOfficialOrder, normalize, OFFICIAL_CELLS, validateCard, WORD_BANK } from '../rules';
import { loadDraft, playerId, saveDraft } from '../storage';
import type { PublicState } from '../types';
import { useInterval } from '../useInterval';

function keptBank(raw: string[]): string[] {
  const next = Array.from({ length: 9 }, () => '');
  const used = new Set<string>();
  raw.slice(0, 9).forEach((cell, index) => {
    const match = WORD_BANK.find((word) => normalize(word) === normalize(cell));
    if (!match || used.has(normalize(match))) return;
    used.add(normalize(match));
    next[index] = match;
  });
  return next;
}

export function Guest() {
  const id = useMemo(() => playerId(), []);
  const initial = useMemo(() => loadDraft(), []);
  const [name, setName] = useState(initial.name);
  const [cells, setCells] = useState(() => keptBank(initial.cells));
  const [state, setState] = useState<PublicState | null>(null);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const accept = useFresh();

  useInterval(async () => {
    try {
      const next = await fetchState(id);
      if (accept(next)) {
        setState(next);
        setOffline(false);
        if (next.phase === 'live') setEditing(false);
      }
    } catch {
      setOffline(true);
    }
  }, { visible: 1000, hidden: 4000 });

  function remember(nextName: string, nextCells: string[]) {
    saveDraft({ name: nextName, cells: nextCells });
  }

  function canonical(word: string): string {
    return WORD_BANK.find((item) => normalize(item) === normalize(word)) ?? word;
  }

  function place(index: number) {
    const next = cells.slice();
    if (!selected) {
      if (!next[index]) return;
      setSelected(canonical(next[index]));
      next[index] = '';
    } else {
      const from = next.findIndex((cell) => normalize(cell) === normalize(selected));
      const displaced = next[index];
      next[index] = canonical(selected);
      if (from >= 0) next[from] = displaced;
      setSelected(null);
    }
    setCells(next);
    remember(name, next);
    setFormError('');
  }

  async function submit() {
    const checked = validateCard(name, cells);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    if (!isOfficialOrder(checked.cells)) {
      setFormError('Расставь слова в правильном порядке.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const saved = await saveCard({ id, name: checked.name, cells: checked.cells });
      if (accept(saved.state)) setState(saved.state);
      setName(checked.name);
      setCells(OFFICIAL_CELLS.slice());
      setSelected(null);
      remember(checked.name, OFFICIAL_CELLS);
      setEditing(false);
      setOffline(false);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Связь прервалась.');
    } finally {
      setSaving(false);
    }
  }

  const player = state?.player ?? null;
  const showForm = state?.phase === 'lobby' && (!player || editing);
  const showAccepted = state?.phase === 'lobby' && Boolean(player) && !editing;
  const showLive = state?.phase === 'live' && Boolean(player);
  const showClosed = state?.phase === 'live' && !player;

  return (
    <main className="page narrow">
      {!state && <p className="status">Открываю клетки…</p>}
      {offline && <p className="banner">Связь прервалась.</p>}
      {state && <p className="phase">{state.phase === 'live' ? 'Игра идёт' : 'Набор карточек'}</p>}

      {showClosed && (
        <section className="stack">
          <Brand />
          <p className="lead">Набор закрыт. Попроси ведущего снова открыть набор.</p>
        </section>
      )}

      {showForm && (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="field">
            <span>Имя</span>
            <input
              value={name}
              maxLength={24}
              autoComplete="name"
              autoCapitalize="words"
              onChange={(event) => {
                setName(event.target.value);
                remember(event.target.value, cells);
              }}
            />
          </label>
          <Brand />
          <p className="muted">Нажми слово, потом клетку.</p>
          <WordGrid cells={cells} onCell={place} />
          <div className="bank" aria-label="Список слов">
            {WORD_BANK.map((word) => {
              const used = cells.some((cell) => normalize(cell) === normalize(word));
              if (used) return null;
              const active = selected !== null && normalize(selected) === normalize(word);
              return (
                <button
                  key={word}
                  type="button"
                  className={active ? 'chip selected' : 'chip'}
                  aria-pressed={active}
                  onClick={() => setSelected(active ? null : word)}
                >
                  {word}
                </button>
              );
            })}
          </div>
          {formError && <p className="error" role="alert">{formError}</p>}
          <button className="primary" type="submit" disabled={saving}>Готово</button>
        </form>
      )}

      {showAccepted && player && (
        <section className="stack">
          <p className="ok">Карточка принята</p>
          <p className="muted">Слова можно поправить, пока ведущий не начал.</p>
          <p className="who">{player.name}</p>
          <Brand />
          <WordGrid cells={player.cells} />
          <button
            type="button"
            onClick={() => {
              setName(player.name);
              setCells([...player.cells]);
              remember(player.name, player.cells);
              setFormError('');
              setSelected(null);
              setEditing(true);
            }}
          >
            Поправить порядок
          </button>
        </section>
      )}

      {showLive && player && (
        <section className="stack">
          {player.bingo && (
            <div className="bingo-banner">
              <p className="bingo-word">БИНГО</p>
              <p>Линия сложилась: {player.lines.join(', ')}. Покажи телефон ведущему.</p>
            </div>
          )}
          <Brand />
          <WordGrid cells={player.cells} marks={player.marks} winning={player.winning} />
          <p className="who">{player.name}</p>
          <p className="lead">
            {state && state.called.length > 0
              ? `Сейчас звучит: ${state.called[state.called.length - 1].text}`
              : 'Ждём первое слово от ведущего.'}
          </p>
          {!player.bingo && player.closest === 2 && (
            <p className="almost">ещё одно слово, и линия сложится.</p>
          )}
        </section>
      )}

      <footer className="footer">
        <Link to="/host">Я ведущий</Link>
      </footer>
    </main>
  );
}
