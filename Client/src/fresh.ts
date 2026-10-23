import { useRef } from 'react';

export function useFresh() {
  const revision = useRef(-1);
  return <T extends { revision: number }>(next: T) => {
    if (next.revision < revision.current) return false;
    revision.current = next.revision;
    return true;
  };
}
