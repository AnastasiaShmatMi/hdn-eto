import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, fetchHost, hostAction } from '../api';
import { Brand } from '../components/Brand';
import { QrCode } from '../components/QrCode';
import { WordGrid } from '../components/WordGrid';
import { useFresh } from '../fresh';
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
  const [word, setWord] = useState('');
  const [link, setLink] = useState('');
  const [linkTouched, setLinkTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [armReset, setArmReset] = useState(false);
  const [armDelete, setArmDelete] = useState<string | null>(null);
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

  useEffect(() => {
    if (!linkTouched && state?.joinUrl) setLink(state.joinUrl);
  }, [linkTouched, state?.joinUrl]);

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

  async function speak(text: string, fromField: boolean) {
    const clean = text.trim();
    if (!clean) {
      setNote({ type: 'err', text: 'Напиши слово.' });
      return;
    }
    const ok = await perform(() => hostAction(pin, '/api/host/call', { text: clean }), '');
    if (ok && fromField) setWord('');
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

      <section className="panel qr-row">
        <div className="host-qr">
          <QrCode value={link} />
        </div>
        <div className="stack">
          <label className="field">
            <span>Ссылка в коде</span>
            <input
              value={link}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setLinkTouched(true);
                setLink(event.target.value);
              }}
            />
          </label>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                }).catch(() => {
                  setNote({ type: 'err', text: 'Не удалось скопировать. Выдели ссылку вручную.' });
                });
              }}
            >
              {copied ? 'Скопировано' : 'Скопировать'}
            </button>
            <button
              type="button"
              onClick={() => {
                setLinkTouched(true);
                setLink(`${window.location.origin}/`);
              }}
            >
              этот экран
            </button>
          </div>
        </div>
      </section>

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
          <button
            type="button"
            disabled={busy}
            onClick={() => void perform(() => hostAction(pin, '/api/host/lobby'), 'Снова набор карточек.')}
          >
            Вернуть набор
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
        {armReset && <p className="muted">Сбросить стол? Карточки и названные слова удалятся.</p>}
        {state.cardCount === 0 && state.phase === 'lobby' && (
          <p className="muted">Сначала пусть гости сохранят карточки.</p>
        )}
      </section>

      <section className="panel stack">
        <form
          className="call-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (state.phase === 'live') void speak(word, true);
          }}
        >
          <label className="field">
            <span>Назвать слово</span>
            <input
              value={word}
              maxLength={40}
              disabled={state.phase !== 'live' || busy}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setWord(event.target.value)}
            />
          </label>
          <button className="primary" type="submit" disabled={state.phase !== 'live' || busy}>Назвать</button>
        </form>
        <button
          type="button"
          disabled={busy || state.called.length === 0}
          onClick={() => void perform(() => hostAction(pin, '/api/host/undo'), 'Последнее слово убрано.')}
        >
          Отменить последнее слово
        </button>
        {note && (
          <p className={note.type === 'err' ? 'error' : 'ok'} role={note.type === 'err' ? 'alert' : 'status'}>
            {note.text}
          </p>
        )}
      </section>

      <section className="panel stack">
        <h2>Облако слов</h2>
        {state.cloud.length === 0 ? (
          <p className="muted">Облако появится, когда гости сохранят слова.</p>
        ) : (
          <div className="cloud">
            {state.cloud.map((item) => (
              <button
                key={item.text}
                type="button"
                className={item.called ? 'chip called' : 'chip'}
                disabled={state.phase !== 'live' || item.called || busy}
                onClick={() => void speak(item.text, false)}
              >
                <span>{item.text}</span>
                <span className="chip-count">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </section>

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
                {player.bingo && <p className="bingo-word">БИНГО</p>}
                {player.bingo && <p>Линия сложилась: {player.lines.join(', ')}</p>}
                {!player.bingo && player.closest === 2 && <p className="almost">Почти</p>}
                <WordGrid
                  cells={player.cells}
                  marks={player.marks}
                  winning={player.winning}
                  onCell={state.phase === 'live' ? (index) => void speak(player.cells[index], false) : undefined}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
