import { MAX_BET, MOVES, type Pending } from './game';

export const PENDING_KEY = 'strock:testnet:pending:v1';
export function readPending(): Pending | null {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (
      p.version !== 1 ||
      !/^[a-f0-9]{64}$/.test(p.hash) ||
      !/^G[A-Z2-7]{55}$/.test(p.address) ||
      !/^C[A-Z2-7]{55}$/.test(p.contractId) ||
      typeof p.network !== 'string' ||
      !MOVES.includes(p.move) ||
      !/^\d+$/.test(p.bet) ||
      BigInt(p.bet) <= 0n ||
      BigInt(p.bet) > MAX_BET ||
      !Number.isFinite(p.expiresAt) ||
      !Number.isFinite(p.createdAt)
    )
      throw new Error();
    return p as Pending;
  } catch {
    throw new Error(
      'La référence locale de transaction est illisible. Vérifie ton historique Freighter avant de supprimer les données de ce site.',
    );
  }
}
export function savePending(pending: Pending) {
  // This must succeed BEFORE any submission; otherwise recovery cannot be guaranteed.
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  if (localStorage.getItem(PENDING_KEY) !== JSON.stringify(pending))
    throw new Error('Le suivi local est indisponible. Aucune transaction envoyée.');
}
export function clearPending() {
  localStorage.removeItem(PENDING_KEY);
}
