import {
  botFor,
  payoutFor,
  settle,
  sleep,
  UNIT,
  type Move,
  type Progress,
  type Round,
  type Scenario,
  type Outcome,
} from '../game';

const KEY = 'strock:demo:v1';
const sequence: Outcome[] = ['win', 'tie', 'win', 'loss'];
interface DemoState {
  balance: string;
  step: number;
  pending?: { move: Move; bet: string; outcome: Outcome; readyAt: number; networkOnce: boolean };
}
function read(): DemoState {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value && /^\d+$/.test(value.balance) && Number.isInteger(value.step)) return value;
  } catch {
    /* demo data may safely reset */
  }
  return { balance: (100n * UNIT).toString(), step: 0 };
}
function write(value: DemoState) {
  localStorage.setItem(KEY, JSON.stringify(value));
}
export function balance() {
  return BigInt(read().balance);
}
export function reset() {
  write({ balance: (100n * UNIT).toString(), step: 0 });
}
export function pending() {
  return Boolean(read().pending);
}
export function pendingRound() {
  const p = read().pending;
  return p ? { move: p.move, bet: p.bet } : null;
}
export async function resume(onProgress: (p: Progress) => void): Promise<Round | null> {
  const state = read();
  const p = state.pending;
  if (!p) return null;
  onProgress({ phase: 'pending' });
  if (p.networkOnce) {
    p.networkOnce = false;
    write(state);
    throw new Error(
      'Connexion interrompue après l’envoi simulé. Utilise « Vérifier à nouveau » pour retrouver cette manche.',
    );
  }
  if (Date.now() < p.readyAt) return null;
  const bet = BigInt(p.bet);
  const round: Round = {
    playerMove: p.move,
    bankMove: botFor(p.move, p.outcome),
    outcome: p.outcome,
    bet,
    payout: payoutFor(bet, p.outcome),
    mode: 'demo',
    fee: 0n,
  };
  const next = {
    balance: settle(BigInt(state.balance), bet, p.outcome).toString(),
    step: state.step + 1,
  };
  write(next);
  return round;
}
export async function play(
  move: Move,
  bet: bigint,
  scenario: Scenario,
  onProgress: (p: Progress) => void,
  cancelled = () => false,
): Promise<Round | null> {
  if (pending()) throw new Error('Une manche est déjà en attente.');
  const state = read();
  settle(BigInt(state.balance), bet, 'tie');
  onProgress({ phase: 'preparing', fee: 0n });
  await sleep(250);
  if (scenario === 'bank') throw new Error('BankTooPoor');
  onProgress({ phase: 'signing' });
  await sleep(350);
  if (cancelled()) throw new Error('Préparation abandonnée. Aucune manche envoyée.');
  if (scenario === 'refused')
    throw new Error('Signature refusée dans la démo. Aucune mise prélevée.');
  const outcome = ['win', 'tie', 'loss'].includes(scenario)
    ? (scenario as Outcome)
    : sequence[state.step % sequence.length];
  state.pending = {
    move,
    bet: bet.toString(),
    outcome,
    readyAt: Date.now() + (scenario === 'slow' ? 8000 : 1000),
    networkOnce: scenario === 'network',
  };
  write(state);
  onProgress({ phase: 'sending' });
  await sleep(200);
  onProgress({ phase: 'pending' });
  await sleep(900);
  return resume(onProgress);
}
