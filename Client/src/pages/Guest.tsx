import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, fetchState, saveCard } from '../api';
import { Brand } from '../components/Brand';
import { WordGrid } from '../components/WordGrid';
import { useFresh } from '../fresh';
import { validateCard } from '../rules';
import { loadDraft, playerId, saveDraft } from '../storage';
import type { PublicState } from '../types';
import { useInterval } from '../useInterval';

export function Guest() {
  const id = useMemo(() => playerId(), []);
  const initial = useMemo(() => loadDraft(), []);
  const [name, setName] = useState(initial.name);
  const [cells, setCells] = useState(initial.cells);
  const [state, setState] = useState<PublicState | null>(null);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
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

  function onPaste(index: number, text: string) {
    if (!/[\n\r\t]/.test(text)) return false;
    const parts = text.split(/[\n\r\t]+/).map((part) => part.trim()).filter((part) => part.length > 0);
    const next = cells.slice();
    parts.forEach((part, offset) => {
      const target = index + offset;
      if (target < 9) next[target] = [...part].slice(0, 40).join('');
    });
    setCells(next);
    remember(name, next);
    const focusAt = Math.min(8, index + Math.max(parts.length, 1));
    requestAnimationFrame(() => inputs.current[focusAt]?.focus());
    return true;
  }

  async function submit() {
    const checked = validateCard(name, cells);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const saved = await saveCard({ id, name: checked.name, cells: checked.cells });
      if (accept(saved.state)) setState(saved.state);
      setName(checked.name);
      setCells(checked.cells);
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
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                inputs.current[0]?.focus();
              }}
            />
          </label>
          <Brand />
          <WordGrid
            cells={cells}
            editing
            inputRefs={inputs}
            onChange={(index, value) => {
              const next = cells.slice();
              next[index] = value;
              setCells(next);
              remember(name, next);
            }}
            onPaste={onPaste}
            onEnter={(index) => {
              if (index < 8) inputs.current[index + 1]?.focus();
              else void submit();
            }}
          />
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
              setEditing(true);
            }}
          >
            Изменить слова
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
