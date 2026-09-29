export const UNIT = 10_000_000n;
export const MAX_BET = ((1n << 127n) - 1n) / 2n;
export const MOVES = ['rock', 'paper', 'scissors'] as const;
export type Move = (typeof MOVES)[number];
export type Outcome = 'win' | 'tie' | 'loss';
export type Mode = 'demo' | 'testnet';
export type Phase =
  'idle' | 'preparing' | 'signing' | 'sending' | 'pending' | 'revealing' | 'result' | 'error';
export type Scenario = 'sequence' | Outcome | 'refused' | 'slow' | 'network' | 'bank';
export const NAMES: Record<Move, string> = {
  rock: 'Pierre',
  paper: 'Feuille',
  scissors: 'Ciseaux',
};
export interface Round {
  playerMove: Move;
  bankMove: Move;
  outcome: Outcome;
  bet: bigint;
  payout: bigint;
  hash?: string;
  mode: Mode;
  fee?: bigint;
}
export interface Progress {
  phase: Phase;
  fee?: bigint;
  hash?: string;
}
export interface Balance {
  total: bigint;
  available: bigint;
}
export interface Pending {
  version: 1;
  hash: string;
  address: string;
  contractId: string;
  network: string;
  bet: string;
  move: Move;
  expiresAt: number;
  createdAt: number;
}

export function parseAmount(input: string): bigint {
  const value = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,7})?$/.test(value))
    throw new Error('Saisis un montant positif, avec 7 décimales maximum.');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * UNIT + BigInt(fraction.padEnd(7, '0'));
  if (amount <= 0n) throw new Error('La mise doit être supérieure à 0 XLM.');
  if (amount > MAX_BET) throw new Error('Ce montant dépasse la limite du contrat.');
  return amount;
}
export function amountInput(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const fraction = (abs % UNIT).toString().padStart(7, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${abs / UNIT}${fraction ? '.' + fraction : ''}`;
}
export function formatAmount(value: bigint): string {
  const [whole, fraction] = amountInput(value).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + (fraction ? ',' + fraction : '');
}
export function outcomeFor(player: Move, bot: Move): Outcome {
  if (player === bot) return 'tie';
  return (MOVES.indexOf(player) - MOVES.indexOf(bot) + 3) % 3 === 1 ? 'win' : 'loss';
}
export function payoutFor(bet: bigint, outcome: Outcome): bigint {
  return outcome === 'win' ? bet * 2n : outcome === 'tie' ? bet : 0n;
}
export function botFor(player: Move, outcome: Outcome): Move {
  return MOVES[(MOVES.indexOf(player) + (outcome === 'win' ? 2 : outcome === 'loss' ? 1 : 0)) % 3];
}
export function settle(balance: bigint, bet: bigint, outcome: Outcome): bigint {
  if (bet <= 0n || bet > balance) throw new Error('Solde insuffisant pour cette mise.');
  return balance - bet + payoutFor(bet, outcome);
}
export function messageFor(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/BankTooPoor|Error\(Contract, #2\)/i.test(text))
    return 'La banque ne peut pas couvrir cette mise. Essaie un montant inférieur.';
  if (/InvalidBet|Error\(Contract, #1\)/i.test(text))
    return 'La mise doit être supérieure à 0 XLM.';
  if (/insufficient|underfunded|balance is not sufficient|balance.*amount/i.test(text))
    return 'Solde insuffisant pour la mise, les réserves et les frais réseau.';
  if (/User declined|User rejected|rejected|denied/i.test(text))
    return 'Signature refusée. Aucune nouvelle manche envoyée.';
  if (/fetch|NetworkError|timeout|Failed to|ECONN/i.test(text))
    return 'Le réseau ne répond pas. Vérifie ta connexion, puis réessaie.';
  if (/archived|restore|ExpiredState/i.test(text))
    return 'Le contrat doit être réactivé par l’équipe back avant de jouer.';
  return text.length > 220
    ? 'La transaction ne peut pas être préparée. Vérifie le réseau, ton solde et la disponibilité du contrat.'
    : text;
}
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface GameState {
  phase: Phase;
  move: Move | null;
  round: Round | null;
  error: string | null;
}
export type GameAction =
  | { type: 'start'; move: Move }
  | { type: 'progress'; phase: Phase }
  | { type: 'confirmed'; round: Round }
  | { type: 'reveal' }
  | { type: 'error'; error: string }
  | { type: 'reset' };
export const INITIAL_GAME: GameState = { phase: 'idle', move: null, round: null, error: null };
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'start':
      return ['idle', 'result', 'error'].includes(state.phase)
        ? { phase: 'preparing', move: action.move, round: null, error: null }
        : state;
    case 'progress':
      return { ...state, phase: action.phase, error: null };
    case 'confirmed':
      return {
        ...state,
        phase: 'revealing',
        round: action.round,
        move: action.round.playerMove,
        error: null,
      };
    case 'reveal':
      return state.round ? { ...state, phase: 'result' } : state;
    case 'error':
      return { ...state, phase: 'error', error: action.error };
    case 'reset':
      return INITIAL_GAME;
  }
}
