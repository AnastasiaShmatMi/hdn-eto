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
    let queued = false;
    let timer = 0;

    const schedule = () => {
      window.clearTimeout(timer);
      const wait = document.visibilityState === 'hidden' ? delayRef.current.hidden : delayRef.current.visible;
      timer = window.setTimeout(() => {
        void tick();
      }, wait);
    };

    const tick = async () => {
      if (stop) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      queued = false;
      try {
        await runRef.current();
      } catch {
        // The page callback reports its own error. The loop keeps going.
      } finally {
        running = false;
      }
      if (stop) return;
      if (queued) {
        queued = false;
        void tick();
        return;
      }
      schedule();
    };

    const wake = () => {
      if (document.visibilityState === 'hidden') return;
      window.clearTimeout(timer);
      void tick();
    };

    void tick();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', wake);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('online', wake);
    };
  }, []);
}
