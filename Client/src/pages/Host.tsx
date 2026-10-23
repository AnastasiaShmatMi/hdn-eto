import { useRef, useState, type FormEvent } from 'react';
import { ApiError, fetchHost, hostAction } from '../api';
import { Brand } from '../components/Brand';
import { WordGrid } from '../components/WordGrid';
import { useFresh } from '../fresh';
import { normalize, usesBank, WORD_BANK } from '../rules';
import { clearPin, loadPin, savePin } from '../storage';
import type { HostState } from '../types';
import { useInterval } from '../useInterval';

type Note = { type: 'ok' | 'err'; text: string } | null;
type Filter = 'all' | 'bingo' | 'close' | 'wait';

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'bingo', label: 'Бинго' },
  { id: 'close', label: 'Почти' },
  { id: 'wait', label: 'Ещё нет' },
];

export function Host() {
  const [pin, setPin] = useState(() => loadPin());
  const [draftPin, setDraftPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [state, setState] = useState<HostState | null>(null);
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [armReset, setArmReset] = useState(false);
  const [armDelete, setArmDelete] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<string[] | null>(null);
  const [orderWord, setOrderWord] = useState<string | null>(null);
  const [orderFrom, setOrderFrom] = useState<number | null>(null);
  const pinRef = useRef(pin);
  const accept = useFresh();
  pinRef.current = pin;

  useInterval(async () => {
    const current = pinRef.current;
    if (!current) return;
    try {
      const next = await fetchHost(current);
      if (pinRef.current !== current) return;
      if (accept(next)) {
        setState(next);
        setOffline(false);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearPin();
        setPin('');
        setState(null);
        setLoginError('Неверный код.');
        return;
      }
      setOffline(true);
    }
  }, { visible: 1000, hidden: 1000 });

  async function enter(event: FormEvent) {
    event.preventDefault();
    const next = draftPin.trim();
    if (!next) {
      setLoginError('Впиши код ведущего.');
      return;
    }
    setChecking(true);
    setLoginError('');
    try {
      const table = await fetchHost(next);
      savePin(next);
      setPin(next);
      if (accept(table)) setState(table);
      setOffline(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setLoginError('Неверный код.');
      else if (error instanceof ApiError) setLoginError(error.message);
      else setLoginError('Связь прервалась.');
    } finally {
      setChecking(false);
    }
  }

  function losePin() {
    clearPin();
    setPin('');
    setState(null);
    setLoginError('Неверный код.');
  }

  async function perform(task: () => Promise<{ state: HostState; message?: string }>, fallback: string) {
    setBusy(true);
    setNote(null);
    try {
      const result = await task();
      if (accept(result.state)) setState(result.state);
      setNote({ type: 'ok', text: result.message || fallback });
      setOffline(false);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        losePin();
        return false;
      }
      setNote({ type: 'err', text: error instanceof ApiError ? error.message : 'Связь прервалась.' });
      return false;
    } finally {
      setBusy(false);
      setArmReset(false);
      setArmDelete(null);
    }
  }

  function beginOrder() {
    if (!state?.template || state.template.length !== 9) return;
    setOrderDraft(state.template.slice());
    setOrderWord(null);
    setOrderFrom(null);
    setNote(null);
  }

  function cancelOrder() {
    setOrderDraft(null);
    setOrderWord(null);
    setOrderFrom(null);
  }

  function chooseOrder(word: string | null) {
    setOrderWord(word);
    setOrderFrom(null);
  }

  function placeOrder(index: number) {
    if (!orderDraft) return;
    const next = orderDraft.slice();
    if (!orderWord) {
      if (!next[index]) return;
      setOrderWord(WORD_BANK.find((word) => normalize(word) === normalize(next[index])) ?? next[index]);
      setOrderFrom(index);
      next[index] = '';
    } else {
      const word = WORD_BANK.find((item) => normalize(item) === normalize(orderWord)) ?? orderWord;
      const displaced = next[index];
      next[index] = word;
      if (orderFrom !== null && orderFrom !== index) next[orderFrom] = displaced;
      setOrderWord(null);
      setOrderFrom(null);
    }
    setOrderDraft(next);
    setNote(null);
  }

  async function saveOrder() {
    if (!orderDraft) return;
    if (orderDraft.some((cell) => !cell) || !usesBank(orderDraft)) {
      setNote({ type: 'err', text: 'Заполни все девять клеток словами из списка.' });
      return;
    }
    if (new Set(orderDraft.map((cell) => normalize(cell))).size !== 9) {
      setNote({ type: 'err', text: 'Все 9 слов должны быть разными.' });
      return;
    }
    const ok = await perform(
      () => hostAction(pin, '/api/host/template', { cells: orderDraft }),
      'Порядок сохранён.',
    );
    if (ok) cancelOrder();
  }

  if (!pin) {
    return (
      <main className="page narrow">
        <Brand />
        <p className="who">Стол ведущего</p>
        <form className="panel stack" onSubmit={(event) => void enter(event)}>
          <label className="field">
            <span>Код ведущего</span>
            <input
              value={draftPin}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setDraftPin(event.target.value)}
            />
          </label>
          {loginError && <p className="error" role="alert">{loginError}</p>}
          <button className="primary" type="submit" disabled={checking}>Войти</button>
        </form>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="page narrow">
        <p className="status">Открываю стол…</p>
        {offline && <p className="banner">Связь прервалась.</p>}
        {loginError && <p className="error">{loginError}</p>}
      </main>
    );
  }

  const bingoPlayers = state.phase === 'live' ? state.players.filter((player) => player.bingo) : [];
  const shown = state.players.filter((player) => {
    if (filter === 'bingo') return player.bingo;
    if (filter === 'close') return !player.bingo && player.closest === 2;
    if (filter === 'wait') return !player.bingo && player.closest < 2;
    return true;
  });

  return (
    <main className="page">
      <header className="topbar">
        <Brand size="md" />
        <a className="quiet" href="/screen" target="_blank" rel="noreferrer">Экран</a>
      </header>
      <p className="phase">{state.phase === 'live' ? 'Игра идёт' : 'Набор карточек'}</p>
      {offline && <p className="banner">Связь прервалась.</p>}

      {state.template && state.template.length === 9 && (
        <section className="panel stack">
          <h2>Правильный вариант</h2>
          {orderDraft ? (
            <>
              <p className="muted">Нажми слово и поставь его в клетку. Чтобы поменять местами, нажми одну клетку, потом другую.</p>
              <div className="word-list" aria-label="Список слов">
                {WORD_BANK.map((word) => {
                  const used = orderDraft.some((cell) => normalize(cell) === normalize(word));
                  const active = !used && orderWord !== null && normalize(orderWord) === normalize(word);
                  return (
                    <button
                      key={word}
                      type="button"
                      className={used ? 'pick used' : active ? 'pick selected' : 'pick'}
                      aria-pressed={active}
                      disabled={used || busy}
                      onClick={() => chooseOrder(active ? null : word)}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
              <WordGrid cells={orderDraft} onCell={placeOrder} />
              <div className="row">
                <button className="primary" type="button" disabled={busy} onClick={() => void saveOrder()}>
                  Сохранить порядок
                </button>
                <button type="button" disabled={busy} onClick={cancelOrder}>Отмена</button>
              </div>
              {note && (
                <p className={note.type === 'err' ? 'error' : 'ok'} role={note.type === 'err' ? 'alert' : 'status'}>
                  {note.text}
                </p>
              )}
            </>
          ) : (
            <>
              <WordGrid cells={state.template} />
              <button type="button" disabled={busy} onClick={beginOrder}>Поменять порядок</button>
            </>
          )}
        </section>
      )}

      <section className="panel stack">
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy || state.phase === 'live' || state.cardCount === 0}
            onClick={() => void perform(() => hostAction(pin, '/api/host/start'), 'Игра началась.')}
          >
            Начать игру
          </button>
          {armReset ? (
            <>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void perform(() => hostAction(pin, '/api/host/reset'), 'Стол пустой.')}
              >
                Да, сбросить
              </button>
              <button type="button" onClick={() => setArmReset(false)}>Отмена</button>
            </>
          ) : (
            <button type="button" onClick={() => setArmReset(true)}>Сбросить стол</button>
          )}
        </div>
        {armReset && <p className="muted">Сбросить стол? Карточки удалятся, правильный вариант останется.</p>}
        {state.cardCount === 0 && state.phase === 'lobby' && (
          <p className="muted">Сначала пусть гости сохранят карточки.</p>
        )}
        {!orderDraft && note && (
          <p className={note.type === 'err' ? 'error' : 'ok'} role={note.type === 'err' ? 'alert' : 'status'}>
            {note.text}
          </p>
        )}
      </section>

      {state.phase === 'live' && (
        <section className="panel stack">
          <h2>Бинго</h2>
          {bingoPlayers.length === 0 ? (
            <p className="muted">Пока ни у кого.</p>
          ) : (
            <ul className="bingo-list">
              {bingoPlayers.map((player) => <li key={player.id}>{player.displayName}</li>)}
            </ul>
          )}
        </section>
      )}

      <section className="stack">
        <div className="row filters">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
          <p className="who">{state.cardCountText}</p>
        </div>
        {shown.length === 0 ? (
          <p className="muted">Таких карточек нет.</p>
        ) : (
          <div className="player-list">
            {shown.map((player) => (
              <article key={player.id} className={player.bingo ? 'player bingo' : 'player'}>
                <div className="player-head">
                  <h3>{player.displayName}</h3>
                  {armDelete === player.id ? (
                    <div className="row">
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void perform(
                          () => hostAction(pin, '/api/host/remove', { id: player.id }),
                          'Карточка удалена.',
                        )}
                      >
                        Да, удалить
                      </button>
                      <button type="button" onClick={() => setArmDelete(null)}>Отмена</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setArmDelete(player.id)}>Удалить</button>
                  )}
                </div>
                {state.phase === 'live' && player.matchText && <p className="ok">{player.matchText}</p>}
                {player.bingo && <p className="bingo-word">БИНГО</p>}
                {player.bingo && <p>Линия сложилась: {player.lines.join(', ')}</p>}
                {!player.bingo && player.closest === 2 && <p className="almost">Почти</p>}
                <WordGrid
                  cells={player.cells}
                  marks={player.marks}
                  winning={player.winning}
                  correct={state.phase === 'live' ? player.templateMarks : undefined}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
