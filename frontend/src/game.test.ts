import { describe, expect, it } from 'vitest';
import {
  amountInput,
  botFor,
  formatAmount,
  formatBalance,
  gameReducer,
  INITIAL_GAME,
  MAX_BET,
  outcomeFor,
  parseAmount,
  payoutFor,
  settle,
  UNIT,
  type Move,
  type Outcome,
} from './game';

describe('les neuf duels', () => {
  const cases: [Move, Move, Outcome][] = [
    ['rock', 'rock', 'tie'],
    ['rock', 'paper', 'loss'],
    ['rock', 'scissors', 'win'],
    ['paper', 'rock', 'win'],
    ['paper', 'paper', 'tie'],
    ['paper', 'scissors', 'loss'],
    ['scissors', 'rock', 'loss'],
    ['scissors', 'paper', 'win'],
    ['scissors', 'scissors', 'tie'],
  ];
  it.each(cases)('%s contre %s = %s', (player, bot, expected) => {
    expect(outcomeFor(player, bot)).toBe(expected);
    expect(botFor(player, expected)).toBe(bot);
  });
});
describe('montants exacts', () => {
  it('affiche le solde arrondi avec exactement deux décimales sans modifier les montants', () => {
    expect(formatBalance(0n)).toBe('0,00');
    expect(formatBalance(10n * UNIT)).toBe('10,00');
    expect(formatBalance(101249999n)).toBe('10,12');
    expect(formatBalance(101250000n)).toBe('10,13');
    expect(formatBalance(99999999n)).toBe('10,00');
    expect(formatBalance(123456789012345678901n)).toBe('12\u202f345\u202f678\u202f901\u202f234,57');
    expect(formatAmount(101250000n)).toBe('10,125');
  });
  it.each([
    ['0,0000001', 1n],
    ['10.1234567', 101234567n],
    ['0001', UNIT],
    [' 5 ', 5n * UNIT],
  ])('convertit %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
  it.each([
    '0',
    '-1',
    '1e3',
    'Infinity',
    'NaN',
    '',
    '1.12345678',
    '1,2.3',
    '1.',
    amountInput(MAX_BET + 1n),
  ])('rejette %s', (input) => expect(() => parseAmount(input)).toThrow());
  it('ne perd pas la précision au-delà des entiers JS sûrs', () => {
    const value = 9007199254740993n;
    expect(parseAmount(amountInput(value))).toBe(value);
    expect(formatAmount(1n)).toBe('0,0000001');
  });
  it('paie automatiquement 100 → 110 → 130 ou 90', () => {
    const afterFirst = settle(100n * UNIT, 10n * UNIT, 'win');
    expect(afterFirst).toBe(110n * UNIT);
    expect(payoutFor(10n * UNIT, 'win')).toBe(20n * UNIT);
    expect(settle(afterFirst, 20n * UNIT, 'win')).toBe(130n * UNIT);
    expect(settle(afterFirst, 20n * UNIT, 'loss')).toBe(90n * UNIT);
    expect(settle(afterFirst, 20n * UNIT, 'tie')).toBe(afterFirst);
  });
  it('ne prélève rien sur une suite d’égalités', () => {
    let balance = 100n * UNIT;
    for (let i = 0; i < 20; i++) balance = settle(balance, 10n * UNIT, 'tie');
    expect(balance).toBe(100n * UNIT);
  });
  it('rejette une mise impossible', () => expect(() => settle(10n, 11n, 'loss')).toThrow());
});
describe('états du jeu', () => {
  it('ne remplace pas un choix en cours au deuxième clic', () => {
    const state = gameReducer(INITIAL_GAME, { type: 'start', move: 'rock' });
    expect(gameReducer(state, { type: 'start', move: 'paper' })).toEqual(state);
  });
  it('ne révèle rien sans résultat confirmé', () => {
    const pending = gameReducer(INITIAL_GAME, { type: 'progress', phase: 'pending' });
    expect(gameReducer(pending, { type: 'reveal' })).toEqual(pending);
  });
});
