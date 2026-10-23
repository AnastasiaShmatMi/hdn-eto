import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createGame } from '../src/game';
import {
  calledOnCards,
  cardCountText,
  evaluate,
  hostView,
  normalize,
  validateCard,
  type StoredState,
} from '../src/logic';

const nine = ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и'];

test('нормализация схлопывает пробелы, регистр, ё и лёгкую пунктуацию', () => {
  assert.equal(normalize('  Ёлка! '), 'елка');
  assert.equal(normalize('елка'), 'елка');
  assert.equal(normalize('ЁЛКА'), 'елка');
  assert.equal(normalize('«Ёлка»'), 'елка');
  assert.equal(normalize('(елка)'), 'елка');
  assert.equal(normalize('елка?'), 'елка');
  assert.equal(normalize('елка.'), 'елка');
  assert.equal(normalize('елка,'), 'елка');
  assert.equal(normalize('ел-ка'), 'елка');
  assert.equal(normalize('ел/ка'), 'елка');
  assert.equal(normalize('  Елка   зеленая  '), 'елка зеленая');
  assert.notEqual(normalize('елка'), normalize('елки'));
});

test('пустые имя и клетки, повтор и длина', () => {
  assert.equal(validateCard('   ', nine).ok, false);
  const emptyName = validateCard('   ', nine);
  assert.equal(emptyName.ok, false);
  if (!emptyName.ok) assert.equal(emptyName.error, 'Напиши, как тебя зовут.');

  const missing = validateCard('Аня', ['а', 'б', '   ', 'г', 'д', 'е', 'ж', 'з', 'и']);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, 'Заполни клетку 3.');

  const punct = validateCard('Аня', ['а', '!!!', 'в', 'г', 'д', 'е', 'ж', 'з', 'и']);
  assert.equal(punct.ok, false);
  if (!punct.ok) assert.equal(punct.error, 'Заполни клетку 2.');

  const duplicate = validateCard('Аня', ['Ёлка', 'елка!', 'в', 'г', 'д', 'е', 'ж', 'з', 'и']);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.error, '«елка!» повторяется. Все 9 слов должны быть разными.');
  }

  const longName = validateCard('А'.repeat(25), nine);
  assert.equal(longName.ok, false);
  if (!longName.ok) assert.equal(longName.error, 'Имя длиннее 24 символов.');

  const longCell = validateCard('Аня', ['б'.repeat(41), 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и']);
  assert.equal(longCell.ok, false);
  if (!longCell.ok) assert.equal(longCell.error, 'Клетка 1 длиннее 40 символов.');

  const ok = validateCard('  Аня   Мария ', [' Ёлка ', 'река', 'мост', 'дом', 'кот', 'сад', 'луна', 'хлеб', 'чай']);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.name, 'Аня Мария');
    assert.equal(ok.cells[0], 'Ёлка');
  }
});

test('ряды, столбцы и обе диагонали', () => {
  const lines = [
    { indexes: [0, 1, 2], name: 'верхний ряд' },
    { indexes: [3, 4, 5], name: 'средний ряд' },
    { indexes: [6, 7, 8], name: 'нижний ряд' },
    { indexes: [0, 3, 6], name: 'левый столбец' },
    { indexes: [1, 4, 7], name: 'средний столбец' },
    { indexes: [2, 5, 8], name: 'правый столбец' },
    { indexes: [0, 4, 8], name: 'диагональ ↘' },
    { indexes: [2, 4, 6], name: 'диагональ ↙' },
  ];
  for (const line of lines) {
    const called = line.indexes.map((index) => nine[index]);
    const score = evaluate(nine, called);
    assert.equal(score.bingo, true, line.name);
    assert.equal(score.closest, 3, line.name);
    assert.deepEqual(score.lines, [line.name]);
    const winning = nine.map((_, index) => line.indexes.includes(index));
    assert.deepEqual(score.winning, winning, line.name);
    assert.deepEqual(score.marks, winning, line.name);
  }
});

test('почти — это две клетки на линии, и ё совпадает с е', () => {
  const almost = evaluate(nine, ['а', 'б']);
  assert.equal(almost.bingo, false);
  assert.equal(almost.closest, 2);
  assert.deepEqual(almost.lines, []);

  const one = evaluate(nine, ['д']);
  assert.equal(one.closest, 1);
  assert.equal(one.bingo, false);

  const none = evaluate(nine, []);
  assert.equal(none.closest, 0);
  assert.equal(none.bingo, false);

  const tree = evaluate(['Ёлка', 'река', 'мост', 'дом', 'кот', 'сад', 'луна', 'хлеб', 'чай'], ['елка!']);
  assert.equal(tree.marks[0], true);
  assert.equal(tree.marks[1], false);
  assert.equal(tree.bingo, false);

  const both = evaluate(nine, ['а', 'в', 'д', 'ж', 'и']);
  assert.equal(both.bingo, true);
  assert.deepEqual(both.lines, ['диагональ ↘', 'диагональ ↙']);
  assert.equal(both.winning[0] && both.winning[2] && both.winning[4] && both.winning[6] && both.winning[8], true);
  assert.equal(both.winning[1], false);
});

test('русские числительные: 1 карточка, 2 карточки, 5 карточек', () => {
  assert.equal(cardCountText(0), '0 карточек');
  assert.equal(cardCountText(1), '1 карточка');
  assert.equal(cardCountText(2), '2 карточки');
  assert.equal(cardCountText(3), '3 карточки');
  assert.equal(cardCountText(4), '4 карточки');
  assert.equal(cardCountText(5), '5 карточек');
  assert.equal(cardCountText(11), '11 карточек');
  assert.equal(cardCountText(12), '12 карточек');
  assert.equal(cardCountText(14), '14 карточек');
  assert.equal(cardCountText(21), '21 карточка');
  assert.equal(cardCountText(22), '22 карточки');
  assert.equal(cardCountText(25), '25 карточек');
  assert.equal(cardCountText(104), '104 карточки');
  assert.equal(cardCountText(111), '111 карточек');
  assert.equal(calledOnCards(0), 'Ни на одной карточке.');
  assert.equal(calledOnCards(1), 'Есть на 1 карточке.');
  assert.equal(calledOnCards(2), 'Есть на 2 карточках.');
  assert.equal(calledOnCards(5), 'Есть на 5 карточках.');
  assert.equal(calledOnCards(21), 'Есть на 21 карточке.');
});

test('одинаковые имена нумеруются, бинго выше почти', () => {
  const words = (prefix: string) => Array.from({ length: 9 }, (_, index) => `${prefix}${index}`);
  const state: StoredState = {
    phase: 'live',
    revision: 3,
    called: [
      { id: '1', text: 'а0', at: 1 },
      { id: '2', text: 'а1', at: 2 },
      { id: '3', text: 'а2', at: 3 },
      { id: '4', text: 'б0', at: 4 },
      { id: '5', text: 'б1', at: 5 },
    ],
    players: [
      { id: 'borya', name: 'Боря', cells: words('б'), joinedAt: 1 },
      { id: 'anya-late', name: 'Аня', cells: words('я'), joinedAt: 3 },
      { id: 'anya-early', name: 'Аня', cells: words('а'), joinedAt: 2 },
    ],
  };
  const view = hostView(state, 'https://cards.example/');
  assert.deepEqual(view.players.map((player) => player.displayName), ['Аня · 1', 'Боря', 'Аня · 2']);
  assert.equal(view.players[0].bingo, true);
  assert.equal(view.players[1].bingo, false);
  assert.equal(view.players[1].closest, 2);
  assert.equal(view.players[2].closest, 0);
  const tree = view.cloud.find((item) => item.text === 'а0');
  assert.ok(tree);
  assert.equal(tree.called, true);
  assert.equal(tree.count, 1);
});

test('стол помнит карточку, старт, слово и возврат в набор', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdn-game-'));
  const file = path.join(dir, 'game.json');
  try {
    const game = createGame(file);
    const id = '11111111-1111-4111-8111-111111111111';
    const cells = ['Ёлка', 'река', 'мост', 'дом', 'кот', 'сад', 'луна', 'хлеб', 'чай'];
    assert.throws(() => game.start(), /Сначала нужна хотя бы одна карточка/);
    game.saveCard({ id, name: 'Аня', cells });
    game.start();
    assert.throws(() => game.start(), /Игра уже идёт/);
    assert.throws(() => game.saveCard({ id, name: 'Аня', cells }), /Набор закрыт/);
    const called = game.call('елка!');
    assert.equal(called.count, 1);
    assert.equal(called.message, 'Есть на 1 карточке.');
    const live = game.publicState(id);
    assert.equal(live.phase, 'live');
    assert.equal(live.called.at(-1)?.text, 'елка!');
    assert.equal(live.player?.marks[0], true);
    assert.throws(() => game.call('Ёлка'), /уже звучало/);
    game.toLobby();
    const lobby = game.publicState(id);
    assert.equal(lobby.phase, 'lobby');
    assert.deepEqual(lobby.called, []);
    assert.equal(lobby.cardCount, 1);
    const reloaded = createGame(file);
    assert.equal(reloaded.publicState().cardCount, 1);
    assert.equal(reloaded.publicState().phase, 'lobby');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('не больше 150 карточек, сброс и отмена слова', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hdn-limit-'));
  const file = path.join(dir, 'game.json');
  try {
    const game = createGame(file);
    for (let index = 0; index < 150; index += 1) {
      game.saveCard({
        id: `player-${index.toString().padStart(3, '0')}-ok`,
        name: 'Гость',
        cells: Array.from({ length: 9 }, (_, cell) => `с${index}к${cell}`),
      });
    }
    assert.throws(
      () => game.saveCard({
        id: 'player-extra-ok',
        name: 'Лишний',
        cells: Array.from({ length: 9 }, (_, cell) => `лишний${cell}`),
      }),
      /150/,
    );
    game.saveCard({
      id: 'player-000-ok',
      name: 'Гость',
      cells: Array.from({ length: 9 }, (_, cell) => `замена${cell}`),
    });
    assert.equal(game.publicState().cardCount, 150);
    game.start();
    game.call('замена0');
    game.undo();
    assert.equal(game.publicState().called.length, 0);
    assert.throws(() => game.undo(), /Нечего отменять/);
    game.reset();
    assert.equal(game.publicState().cardCount, 0);
    assert.equal(game.publicState().phase, 'lobby');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
