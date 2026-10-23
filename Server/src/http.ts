import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GameError, type Game } from './game';

const MAX_BODY = 1_000_000;

function expectedPin(): string {
  return process.env.HOST_PIN || 'hdn';
}

export function pinMatches(header: string | undefined): boolean {
  const expected = Buffer.from(expectedPin());
  const got = Buffer.from(header ?? '');
  if (expected.length !== got.length || expected.length === 0) {
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(expected, got);
}

function readPin(req: IncomingMessage): string | undefined {
  const header = req.headers['x-host-pin'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function originAllowed(origin: string): boolean {
  const configured = process.env.CLIENT_ORIGIN;
  if (!configured) return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  try {
    return new URL(origin).origin === new URL(configured).origin;
  } catch {
    return false;
  }
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-host-pin',
    'Access-Control-Max-Age': '600',
  };
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string>) {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    ...extra,
  };
  if (body === null) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  headers['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > MAX_BODY) throw new GameError(400, 'Слишком большой запрос.');
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new GameError(400, 'Не понял запрос.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function handle(req: IncomingMessage, res: ServerResponse, game: Game): Promise<void> {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const path = url.pathname;
  const method = req.method || 'GET';
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

  if (origin && !originAllowed(origin)) {
    send(res, 403, { error: 'Этот адрес не может обращаться к столу.' }, {});
    return;
  }
  const cors = origin ? corsHeaders(origin) : {};
  if (method === 'OPTIONS') {
    send(res, 204, null, cors);
    return;
  }

  try {
    if (method === 'GET' && path === '/health') {
      send(res, 200, { ok: true }, cors);
      return;
    }
    if (method === 'GET' && path === '/api/state') {
      const playerId = url.searchParams.get('playerId') ?? undefined;
      send(res, 200, game.publicState(playerId), cors);
      return;
    }
    if (method === 'POST' && path === '/api/card') {
      const body = await readJson(req);
      const id = isRecord(body) && typeof body.id === 'string' ? body.id : undefined;
      game.saveCard(body);
      send(res, 200, { ok: true, state: game.publicState(id) }, cors);
      return;
    }
    if (path === '/api/host' || path.startsWith('/api/host/')) {
      if (!pinMatches(readPin(req))) {
        send(res, 401, { error: 'Неверный код.' }, cors);
        return;
      }
      if (method === 'GET' && path === '/api/host') {
        send(res, 200, game.hostState(), cors);
        return;
      }
      if (method === 'POST' && path === '/api/host/start') {
        game.start();
        send(res, 200, { ok: true, state: game.hostState() }, cors);
        return;
      }
      if (method === 'POST' && path === '/api/host/finish') {
        game.finish();
        send(res, 200, { ok: true, state: game.hostState() }, cors);
        return;
      }
      if (method === 'POST' && path === '/api/host/lobby') {
        game.toLobby();
        send(res, 200, { ok: true, state: game.hostState() }, cors);
        return;
      }
      if (method === 'POST' && path === '/api/host/reset') {
        game.reset();
        send(res, 200, { ok: true, state: game.hostState() }, cors);
        return;
      }
      if (method === 'POST' && path === '/api/host/undo') {
        game.undo();
        send(res, 200, { ok: true, state: game.hostState() }, cors);
        return;
      }
      if (method === 'POST' && path === '/api/host/remove') {
        const body = await readJson(req);
        game.remove(isRecord(body) ? body.id : undefined);
        send(res, 200, { ok: true, state: game.hostState() }, cors);
        return;
      }
      if (method === 'POST' && path === '/api/host/template') {
        const body = await readJson(req);
        game.setTemplate(isRecord(body) ? body.cells : undefined);
        send(res, 200, { ok: true, state: game.hostState() }, cors);
        return;
      }
      if (method === 'POST' && path === '/api/host/call') {
        const body = await readJson(req);
        const result = game.call(isRecord(body) ? body.text : undefined);
        send(res, 200, { ok: true, ...result, state: game.hostState() }, cors);
        return;
      }
    }
    send(res, 404, { error: 'Нет такой страницы.' }, cors);
  } catch (error) {
    if (error instanceof GameError) {
      send(res, error.status, { error: error.message }, cors);
      return;
    }
    console.error(error);
    send(res, 500, { error: 'Что-то сломалось на сервере.' }, cors);
  }
}

export function listen(game: Game, port: number, host: string) {
  const server = http.createServer((req, res) => {
    void handle(req, res, game).catch((error) => {
      console.error(error);
      if (!res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error: 'Что-то сломалось на сервере.' }));
      }
    });
  });
  return new Promise<http.Server>((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}
