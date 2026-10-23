import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createGame } from '../src/game';
import { listen } from '../src/http';

test('запросы: карточка, старт, слово, публичное состояние, набор', async () => {
  const previous = {
    HOST_PIN: process.env.HOST_PIN,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
    JOIN_URL: process.env.JOIN_URL,
  };
  process.env.HOST_PIN = 'test-pin';
  process.env.CLIENT_ORIGIN = 'https://cards.example';
  process.env.JOIN_URL = 'https://cards.example/';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdn-http-'));
  const file = path.join(dir, 'game.json');
  const game = createGame(file);
  const server = await listen(game, 0, '127.0.0.1');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const id = '22222222-2222-4222-8222-222222222222';
  const cells = ['Ёлка', 'река', 'мост', 'дом', 'кот', 'сад', 'луна', 'хлеб', 'чай'];

  try {
    const saved = await fetch(`${base}/api/card`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Аня', cells }),
    });
    assert.equal(saved.status, 200);
    assert.match(saved.headers.get('cache-control') || '', /no-store/);

    const opened = await fetch(`${base}/api/state?playerId=${id}`);
    const lobby = await opened.json() as { phase: string; cardCount: number; joinUrl: string; player: { cells: string[] } };
    assert.equal(lobby.phase, 'lobby');
    assert.equal(lobby.cardCount, 1);
    assert.equal(lobby.joinUrl, 'https://cards.example/');
    assert.equal(lobby.player.cells[0], 'Ёлка');

    const denied = await fetch(`${base}/api/host/start`, { method: 'POST' });
    assert.equal(denied.status, 401);
    const deniedBody = await denied.json() as { error: string };
    assert.equal(deniedBody.error, 'Неверный код.');

    const started = await fetch(`${base}/api/host/start`, {
      method: 'POST',
      headers: { 'x-host-pin': 'test-pin' },
    });
    assert.equal(started.status, 200);

    const blocked = await fetch(`${base}/api/card`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Аня', cells }),
    });
    assert.equal(blocked.status, 409);

    const called = await fetch(`${base}/api/host/call`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-host-pin': 'test-pin' },
      body: JSON.stringify({ text: 'елка!' }),
    });
    const calledBody = await called.json() as { count: number; message: string };
    assert.equal(called.status, 200);
    assert.equal(calledBody.count, 1);
    assert.equal(calledBody.message, 'Есть на 1 карточке.');

    const liveResponse = await fetch(`${base}/api/state?playerId=${id}`);
    const live = await liveResponse.json() as {
      phase: string;
      called: { text: string }[];
      player: { marks: boolean[]; bingo: boolean };
    };
    assert.equal(live.phase, 'live');
    assert.equal(live.called.at(-1)?.text, 'елка!');
    assert.equal(live.player.marks[0], true);
    assert.equal(live.player.bingo, false);

    const returned = await fetch(`${base}/api/host/lobby`, {
      method: 'POST',
      headers: { 'x-host-pin': 'test-pin' },
    });
    assert.equal(returned.status, 200);
    const after = await (await fetch(`${base}/api/state`)).json() as { phase: string; called: unknown[]; cardCount: number };
    assert.equal(after.phase, 'lobby');
    assert.deepEqual(after.called, []);
    assert.equal(after.cardCount, 1);

    const allowed = await fetch(`${base}/api/state`, { headers: { origin: 'https://cards.example' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://cards.example');
    const forbidden = await fetch(`${base}/api/state`, { headers: { origin: 'https://evil.example' } });
    assert.equal(forbidden.status, 403);

    const preflight = await fetch(`${base}/api/card`, {
      method: 'OPTIONS',
      headers: { origin: 'https://cards.example', 'access-control-request-headers': 'content-type,x-host-pin' },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /x-host-pin/);
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /content-type/i);

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const again = createGame(file);
    assert.equal(again.publicState().phase, 'lobby');
    assert.equal(again.publicState().cardCount, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    fs.rmSync(dir, { recursive: true, force: true });
    if (previous.HOST_PIN === undefined) delete process.env.HOST_PIN;
    else process.env.HOST_PIN = previous.HOST_PIN;
    if (previous.CLIENT_ORIGIN === undefined) delete process.env.CLIENT_ORIGIN;
    else process.env.CLIENT_ORIGIN = previous.CLIENT_ORIGIN;
    if (previous.JOIN_URL === undefined) delete process.env.JOIN_URL;
    else process.env.JOIN_URL = previous.JOIN_URL;
  }
});
