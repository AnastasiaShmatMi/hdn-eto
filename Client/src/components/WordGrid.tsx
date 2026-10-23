import type { ClipboardEvent, KeyboardEvent, MutableRefObject } from 'react';

type Props = {
  cells: string[];
  marks?: boolean[];
  winning?: boolean[];
  correct?: boolean[];
  editing?: boolean;
  inputRefs?: MutableRefObject<(HTMLInputElement | null)[]>;
  onChange?: (index: number, value: string) => void;
  onPaste?: (index: number, text: string) => boolean;
  onEnter?: (index: number) => void;
  onCell?: (index: number) => void;
};

function cellClass(marked: boolean, winning: boolean, correct: boolean): string {
  if (winning) return 'cell winning';
  if (marked) return 'cell marked';
  if (correct) return 'cell correct';
  return 'cell';
}

export function WordGrid({
  cells,
  marks,
  winning,
  correct,
  editing = false,
  inputRefs,
  onChange,
  onPaste,
  onEnter,
  onCell,
}: Props) {
  return (
    <div className="board">
      {cells.map((cell, index) => {
        const marked = Boolean(marks?.[index]);
        const won = Boolean(winning?.[index]);
        const hit = Boolean(correct?.[index]);
        const className = cellClass(marked, won, hit);
        if (editing) {
          return (
            <input
              key={index}
              ref={(node) => {
                if (inputRefs) inputRefs.current[index] = node;
              }}
              className="cell"
              value={cell}
              placeholder="…"
              maxLength={40}
              aria-label={`Клетка ${index + 1}`}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint={index === 8 ? 'done' : 'next'}
              onChange={(event) => onChange?.(index, event.target.value)}
              onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
                const text = event.clipboardData.getData('text');
                if (onPaste?.(index, text)) event.preventDefault();
              }}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                onEnter?.(index);
              }}
            />
          );
        }
        if (onCell) {
          return (
            <button
              key={index}
              type="button"
              className={cell ? className : `${className} empty`}
              aria-label={cell ? `Клетка ${index + 1}: ${cell}` : `Клетка ${index + 1}`}
              disabled={marked}
              onClick={() => onCell(index)}
            >
              {cell}
            </button>
          );
        }
        return (
          <div key={index} className={className}>
            {cell}
          </div>
        );
      })}
    </div>
  );
}
