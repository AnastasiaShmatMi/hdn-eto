import { useState } from 'react';
import { fetchState } from '../api';
import { Brand } from '../components/Brand';
import { QrCode } from '../components/QrCode';
import { useFresh } from '../fresh';
import type { PublicState } from '../types';
import { useInterval } from '../useInterval';

export function Screen() {
  const [state, setState] = useState<PublicState | null>(null);
  const [offline, setOffline] = useState(false);
  const accept = useFresh();

  useInterval(async () => {
    try {
      const next = await fetchState();
      if (accept(next)) {
        setState(next);
        setOffline(false);
      }
    } catch {
      setOffline(true);
    }
  }, { visible: 1000, hidden: 1000 });

  const last = state?.called.at(-1);
  const previous = state ? state.called.slice(0, -1).reverse() : [];

  return (
    <main className="page screen">
      {!state && <p className="status">Открываю экран…</p>}
      {offline && <p className="banner">Связь прервалась.</p>}
      {state?.phase === 'lobby' && (
        <>
          <Brand size="xl" />
          <p className="screen-lead">Наведи камеру и расставь слова</p>
          <QrCode value={state.joinUrl} />
          <p className="screen-url">{state.joinUrl}</p>
          <p className="screen-count">В наборе {state.cardCountText}</p>
        </>
      )}
      {state?.phase === 'live' && (
        <>
          <Brand heading={false} size="md" />
          <h1 className="screen-started">Игра началась</h1>
          {last && (
            <>
              <p className="screen-word">{last.text}</p>
              <p className="screen-kicker">Сейчас</p>
            </>
          )}
          {previous.length > 0 && (
            <div className="screen-past">
              <p className="screen-kicker">Уже звучало</p>
              <div className="screen-past-list">
                {previous.map((item) => <span key={item.id}>{item.text}</span>)}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
