import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  calledOnCards,
  countCardsWith,
  hostView,
  normalize,
  publicView,
  spellAllowed,
  usesAllowedWords,
  validateCard,
  type StoredCalled,
  type StoredPlayer,
  type StoredState,
} from './logic';

export class GameError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_CARDS = 150;

function emptyState(): StoredState {
  return { phase: 'lobby', players: [], called: [], revision: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlayer(value: unknown): value is StoredPlayer {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.joinedAt === 'number'
    && Array.isArray(value.cells)
    && value.cells.length === 9
    && value.cells.every((cell) => typeof cell === 'string');
}

function isCalled(value: unknown): value is StoredCalled {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.text === 'string' && typeof value.at === 'number';
}

function sanitize(value: unknown): StoredState {
  if (!isRecord(value)) return emptyState();
  const players = Array.isArray(value.players) ? value.players.filter(isPlayer).slice(0, MAX_CARDS) : [];
  const called = Array.isArray(value.called) ? value.called.filter(isCalled) : [];
  return {
    phase: value.phase === 'live' ? 'live' : 'lobby',
    players,
    called,
    revision: typeof value.revision === 'number' && Number.isFinite(value.revision) ? value.revision : 0,
  };
}

function readState(file: string): StoredState {
  try {
    return sanitize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') console.error('Не смог прочитать стол, начинаю заново.');
    return emptyState();
  }
}

function writeState(file: string, state: StoredState) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = JSON.stringify(state, null, 2);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, payload, 'utf8');
  try {
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, payload, 'utf8');
    fs.rmSync(tmp, { force: true });
  }
}

export function currentJoinUrl(): string {
  const raw = (process.env.JOIN_URL || 'http://localhost:5173/').trim();
  if (!raw) return 'http://localhost:5173/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function createGame(file: string) {
  let state = readState(file);

  function commit() {
    state.revision += 1;
    writeState(file, state);
  }

  return {
    publicState(playerId?: string) {
      return publicView(state, playerId, currentJoinUrl());
    },
    hostState() {
      return hostView(state, currentJoinUrl());
    },
    saveCard(body: unknown) {
      const record = isRecord(body) ? body : {};
      const id = record.id;
      if (typeof id !== 'string' || !/^[0-9a-zA-Z-]{8,80}$/.test(id)) {
        throw new GameError(400, 'Не получилось узнать эту карточку. Обнови страницу.');
      }
      if (state.phase !== 'lobby') {
        throw new GameError(409, 'Набор закрыт. Попроси ведущего снова открыть набор.');
      }
      const checked = validateCard(record.name, record.cells);
      if (!checked.ok) throw new GameError(400, checked.error);
      if (!usesAllowedWords(checked.cells)) {
        throw new GameError(400, 'Поставь слова из списка.');
      }
      checked.cells = spellAllowed(checked.cells);
      const existing = state.players.find((player) => player.id === id);
      if (!existing && state.players.length >= MAX_CARDS) {
        throw new GameError(400, 'Больше 150 карточек стол не принимает.');
      }
      if (existing) {
        existing.name = checked.name;
        existing.cells = checked.cells;
      } else {
        state.players.push({
          id,
          name: checked.name,
          cells: checked.cells,
          joinedAt: Date.now(),
        });
      }
      commit();
    },
    start() {
      if (state.players.length === 0) {
        throw new GameError(400, 'Сначала нужна хотя бы одна карточка.');
      }
      if (state.phase === 'live') throw new GameError(400, 'Игра уже идёт.');
      state.phase = 'live';
      state.called = [];
      commit();
    },
    toLobby() {
      state.phase = 'lobby';
      state.called = [];
      commit();
    },
    reset() {
      state = { phase: 'lobby', players: [], called: [], revision: state.revision };
      commit();
    },
    undo() {
      if (state.called.length === 0) throw new GameError(400, 'Нечего отменять.');
      state.called.pop();
      commit();
    },
    remove(id: unknown) {
      if (typeof id !== 'string') throw new GameError(404, 'Такой карточки нет.');
      const next = state.players.filter((player) => player.id !== id);
      if (next.length === state.players.length) throw new GameError(404, 'Такой карточки нет.');
      state.players = next;
      commit();
    },
    call(raw: unknown) {
      if (state.phase !== 'live') throw new GameError(400, 'Сначала начни игру.');
      if (typeof raw !== 'string') throw new GameError(400, 'Напиши слово.');
      const text = raw.trim().replace(/[\s\u00a0]+/g, ' ');
      if (!text || !normalize(text)) throw new GameError(400, 'Напиши слово.');
      if ([...text].length > 40) throw new GameError(400, 'Слово длиннее 40 символов.');
      if (state.called.some((item) => normalize(item.text) === normalize(text))) {
        throw new GameError(400, 'Это слово уже звучало.');
      }
      state.called.push({ id: randomUUID(), text, at: Date.now() });
      const count = countCardsWith(state.players, text);
      commit();
      return { count, text, message: calledOnCards(count) };
    },
  };
}

export type Game = ReturnType<typeof createGame>;
