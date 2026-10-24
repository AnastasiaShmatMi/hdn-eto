import { useRef } from 'react';

export function useFresh() {
  const revision = useRef(-1);
  return <T extends { revision: number }>(next: T, force = false) => {
    const nextRevision = typeof next.revision === 'number' ? next.revision : revision.current;
    if (!force && nextRevision < revision.current) return false;
    if (nextRevision > revision.current) revision.current = nextRevision;
    return true;
  };
}
