import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, fetchState, saveCard } from '../api';
import { Brand } from '../components/Brand';
import { WordGrid } from '../components/WordGrid';
import { useFresh } from '../fresh';
import { GUEST_WORDS, normalize, usesBank, validateCard, WORD_BANK } from '../rules';
import { loadDraft, loadRound, playerId, saveDraft, saveRound } from '../storage';
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
  const [selectedFrom, setSelectedFrom] = useState<number | null>(null);
  const accept = useFresh();

  useInterval(async () => {
    try {
      const next = await fetchState(id);
      if (accept(next)) {
        setState(next);
        setOffline(false);
        if (next.phase === 'done') setEditing(false);
        if (typeof next.round === 'number') {
          const seen = loadRound();
          if (seen === null) saveRound(next.round);
          else if (seen !== next.round) {
            const blank = Array.from({ length: 9 }, () => '');
            saveRound(next.round);
            setCells(blank);
            setSelected(null);
            setSelectedFrom(null);
            setFormError('');
            setEditing(false);
            remember(name, blank);
          }
        }
      }
    } catch {
      setOffline(true);
    }
  }, { visible: 1000, hidden: 4000 });

  function remember(nextName: string, nextCells: string[]) {
    saveDraft({ name: nextName, cells: nextCells });
  }

  function clearAll() {
    const blank = Array.from({ length: 9 }, () => '');
    setName('');
    setCells(blank);
    setSelected(null);
    setSelectedFrom(null);
    setFormError('');
    setEditing(true);
    remember('', blank);
  }

  function choose(word: string | null) {
    setSelected(word);
    setSelectedFrom(null);
  }

  function place(index: number) {
    const next = cells.slice();
    if (!selected) {
      if (!next[index]) return;
      setSelected(WORD_BANK.find((word) => normalize(word) === normalize(next[index])) ?? next[index]);
      setSelectedFrom(index);
      next[index] = '';
    } else {
      const word = WORD_BANK.find((item) => normalize(item) === normalize(selected)) ?? selected;
      const displaced = next[index];
      next[index] = word;
      if (selectedFrom !== null && selectedFrom !== index) next[selectedFrom] = displaced;
      setSelected(null);
      setSelectedFrom(null);
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
    if (!usesBank(checked.cells)) {
      setFormError('Поставь слова из списка.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const saved = await saveCard({ id, name: checked.name, cells: checked.cells });
      if (accept(saved.state, true)) setState(saved.state);
      if (!saved.state.player) {
        const again = await fetchState(id);
        if (accept(again, true)) setState(again);
      }
      setName(checked.name);
      setCells(checked.cells);
      setSelected(null);
      setSelectedFrom(null);
      remember(checked.name, checked.cells);
      setEditing(false);
      setOffline(false);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Связь прервалась.');
    } finally {
      setSaving(false);
    }
  }

  const player = state?.player ?? null;
  const filled = Boolean(player && player.cells.length === 9 && player.cells.every((cell) => cell.trim() !== ''));
  const openForCards = state?.phase === 'lobby' || state?.phase === 'live';
  const showFill = openForCards && (!filled || editing);
  const showAccepted = openForCards && filled && !editing;
  const showLive = state?.phase === 'done' && Boolean(player);
  const showClosed = state?.phase === 'done' && !player;
  const phaseText = state?.phase === 'live'
    ? 'Игра началась'
    : state?.phase === 'done'
      ? 'Игра завершена'
      : 'Ждём начала';

  return (
    <main className="page narrow">
      {!state && <p className="status">Открываю клетки…</p>}
      {offline && <p className="banner">Связь прервалась.</p>}
      {state && <p className="phase">{phaseText}</p>}

      {state?.phase === 'done' && state.template && state.template.length === 9 && (
        <section className="stack">
          <h2>Правильный вариант</h2>
          <WordGrid cells={state.template} />
        </section>
      )}

      {showClosed && (
        <section className="stack">
          <Brand />
          <p className="lead">Игра завершена.</p>
        </section>
      )}

      {showFill && (
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
          <p className="muted">Выбери нужные слова и поставь их в клетки.</p>
          <div className="word-list two" aria-label="Список слов">
            {GUEST_WORDS.map((word) => {
              const used = cells.some((cell) => normalize(cell) === normalize(word));
              const active = !used && selected !== null && normalize(selected) === normalize(word);
              return (
                <button
                  key={word}
                  type="button"
                  className={used ? 'pick used' : active ? 'pick selected' : 'pick'}
                  aria-pressed={active}
                  disabled={used}
                  onClick={() => choose(active ? null : word)}
                >
                  {word}
                </button>
              );
            })}
          </div>
          <Brand />
          <WordGrid cells={cells} onCell={place} />
          {formError && <p className="error" role="alert">{formError}</p>}
          <div className="row">
            <button className="primary" type="submit" disabled={saving}>Готово</button>
            <button type="button" disabled={saving} onClick={clearAll}>Сбросить всё</button>
          </div>
        </form>
      )}

      {showAccepted && player && (
        <section className="stack">
          <p className="ok">Карточка принята</p>
          <p className="muted">Порядок можно поправить, пока ведущий не завершил игру.</p>
          <p className="who">{player.name}</p>
          <Brand />
          <WordGrid cells={player.cells} />
          <button
            type="button"
            onClick={() => {
              setName(player.name);
              setCells(keptBank(player.cells));
              remember(player.name, player.cells);
              setFormError('');
              setSelected(null);
              setSelectedFrom(null);
              setEditing(true);
            }}
          >
            Поправить порядок
          </button>
          <button type="button" onClick={clearAll}>Сбросить всё</button>
        </section>
      )}

      {showLive && player && (
        <section className="stack">
          {player.bingo && (
            <div className="bingo-banner">
              <p className="bingo-word">БИНГО</p>
              <p>Совпали три клетки: {player.lines.join(', ')}.</p>
            </div>
          )}
          {player.matchText && <p className="lead">{player.matchText}</p>}
          <Brand />
          <WordGrid
            cells={player.cells}
            marks={player.marks}
            winning={player.winning}
            correct={player.templateMarks}
          />
          <p className="who">{player.name}</p>
          {state && state.called.length > 0 && (
            <p className="lead">Сейчас звучит: {state.called[state.called.length - 1].text}</p>
          )}
          {!player.bingo && player.closest === 2 && (
            <p className="almost">Ещё одна клетка, и будет бинго.</p>
          )}
        </section>
      )}

      <footer className="footer">
        <Link to="/host">Я ведущий</Link>
      </footer>
    </main>
  );
}
