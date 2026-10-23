import { useEffect, useRef } from 'react';

export function useInterval(
  run: () => Promise<void>,
  delays: { visible: number; hidden: number },
) {
  const runRef = useRef(run);
  const delayRef = useRef(delays);
  runRef.current = run;
  delayRef.current = delays;

  useEffect(() => {
    let stop = false;
    let running = false;
    let timer = 0;

    const tick = async () => {
      if (stop || running) return;
      running = true;
      try {
        await runRef.current();
      } finally {
        running = false;
      }
      if (stop) return;
      const wait = document.visibilityState === 'hidden' ? delayRef.current.hidden : delayRef.current.visible;
      timer = window.setTimeout(() => {
        void tick();
      }, wait);
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      void tick();
    };

    void tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
