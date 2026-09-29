import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as demo from './demo';
import { UNIT } from '../game';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  vi.useFakeTimers();
  demo.reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const progress = () => {};
async function play(scenario: Parameters<typeof demo.play>[2], bet = 10n * UNIT) {
  const result = demo.play('rock', bet, scenario, progress);
  await vi.runAllTimersAsync();
  return result;
}
describe('transactions fictives persistantes', () => {
  it('reproduit les paiements et remet le versement en jeu', async () => {
    const first = await play('win');
    expect(first?.payout).toBe(20n * UNIT);
    expect(demo.balance()).toBe(110n * UNIT);
    await play('win', first!.payout);
    expect(demo.balance()).toBe(130n * UNIT);
  });
  it('reprend un envoi interrompu une seule fois', async () => {
    const result = demo.play('rock', 10n * UNIT, 'network', progress);
    const rejection = expect(result).rejects.toThrow('interrompue');
    await vi.runAllTimersAsync();
    await rejection;
    expect(demo.pending()).toBe(true);
    expect(demo.pendingRound()).toEqual({ move: 'rock', bet: (10n * UNIT).toString() });
    expect(demo.balance()).toBe(100n * UNIT);
    expect((await demo.resume(progress))?.outcome).toBe('win');
    expect(demo.balance()).toBe(110n * UNIT);
    expect(await demo.resume(progress)).toBeNull();
    expect(demo.pendingRound()).toBeNull();
    expect(demo.balance()).toBe(110n * UNIT);
  });
  it('ne paie pas pendant la confirmation lente et bloque une nouvelle manche', async () => {
    expect(await play('slow')).toBeNull();
    expect(demo.balance()).toBe(100n * UNIT);
    await expect(demo.play('paper', 10n * UNIT, 'win', progress)).rejects.toThrow('déjà');
    await vi.advanceTimersByTimeAsync(8000);
    expect((await demo.resume(progress))?.payout).toBe(20n * UNIT);
  });
  it.each(['refused', 'bank'] as const)('ne prélève rien lors de %s', async (scenario) => {
    const result = demo.play('paper', 10n * UNIT, scenario, progress);
    const rejection = expect(result).rejects.toThrow();
    await vi.runAllTimersAsync();
    await rejection;
    expect(demo.balance()).toBe(100n * UNIT);
    expect(demo.pending()).toBe(false);
  });
  it('reproduit victoire, égalité, victoire, défaite', async () => {
    const outcomes = [];
    for (let i = 0; i < 4; i++) outcomes.push((await play('sequence'))?.outcome);
    expect(outcomes).toEqual(['win', 'tie', 'win', 'loss']);
  });
});
