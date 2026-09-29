import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { nativeToScVal } from 'double-ou-rien-client';
import { CONFIG, connect, resume } from './stellar';
import { clearPending, readPending, savePending } from '../storage';
import { UNIT, type Pending } from '../game';

const mocked = vi.hoisted(() => ({ getTransaction: vi.fn(), sendTransaction: vi.fn() }));
const wallet = vi.hoisted(() => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
}));
vi.mock('@stellar/freighter-api', () => wallet);
vi.mock('double-ou-rien-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('double-ou-rien-client')>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: class {
        getTransaction = mocked.getTransaction;
        sendTransaction = mocked.sendTransaction;
      },
    },
  };
});
const pending: Pending = {
  version: 1,
  hash: 'a'.repeat(64),
  address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  contractId: CONFIG.contractId,
  network: CONFIG.networkPassphrase,
  bet: (10n * UNIT).toString(),
  move: 'rock',
  createdAt: 1000_000,
  expiresAt: 1180,
};
beforeEach(() => {
  vi.resetAllMocks();
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  savePending(pending);
});
afterEach(() => vi.unstubAllGlobals());
describe('connexion Freighter', () => {
  beforeEach(() => {
    wallet.isConnected.mockResolvedValue({ isConnected: true });
    wallet.requestAccess.mockResolvedValue({ address: pending.address });
    wallet.getAddress.mockResolvedValue({ address: pending.address });
    wallet.getNetwork.mockResolvedValue({ networkPassphrase: CONFIG.networkPassphrase });
  });
  it('refuse un portefeuille absent', async () => {
    wallet.isConnected.mockResolvedValue({ isConnected: false });
    await expect(connect()).rejects.toThrow('absent');
    expect(wallet.requestAccess).not.toHaveBeenCalled();
  });
  it('signale un accès refusé sans signer', async () => {
    wallet.requestAccess.mockResolvedValue({ error: { message: 'refused' } });
    await expect(connect()).rejects.toThrow('refusée');
    expect(wallet.signTransaction).not.toHaveBeenCalled();
  });
  it('bloque le réseau public', async () => {
    wallet.getNetwork.mockResolvedValue({
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });
    await expect(connect()).rejects.toThrow('Stellar Testnet');
  });
  it('refuse un portefeuille déconnecté après autorisation', async () => {
    wallet.getAddress.mockResolvedValue({ address: '' });
    await expect(connect()).rejects.toThrow('déconnecté');
  });
  it('accepte le compte autorisé sur Testnet', async () => {
    await expect(connect()).resolves.toBe(pending.address);
    expect(wallet.signTransaction).not.toHaveBeenCalled();
  });
});
describe('reprise Stellar sans nouvel envoi', () => {
  it('décode le résultat confirmé avec les vrais bindings et clôt le suivi', async () => {
    const returnValue = nativeToScVal(
      { bank_move: 1, outcome: 2, payout: 0n },
      {
        type: {
          bank_move: ['symbol', 'u32'],
          outcome: ['symbol', 'u32'],
          payout: ['symbol', 'i128'],
        },
      },
    );
    mocked.getTransaction.mockResolvedValue({
      status: 'SUCCESS',
      returnValue,
      resultXdr: { feeCharged: () => ({ toBigInt: () => 500n }) },
    });
    expect(await resume(() => {})).toMatchObject({
      playerMove: 'rock',
      bankMove: 'paper',
      outcome: 'loss',
      payout: 0n,
      fee: 500n,
      hash: pending.hash,
    });
    expect(readPending()).toBeNull();
    expect(mocked.sendTransaction).not.toHaveBeenCalled();
    expect(await resume(() => {})).toBeNull();
  });
  it('un résultat temporairement introuvable reste en attente', async () => {
    mocked.getTransaction.mockResolvedValue({
      status: 'NOT_FOUND',
      latestLedgerCloseTime: 1100,
      oldestLedgerCloseTime: 500,
    });
    expect(await resume(() => {})).toBeNull();
    expect(readPending()?.hash).toBe(pending.hash);
    expect(mocked.sendTransaction).not.toHaveBeenCalled();
  });
  it('conserve la référence après une panne réseau', async () => {
    mocked.getTransaction.mockRejectedValue(new Error('Failed to fetch'));
    await expect(resume(() => {})).rejects.toThrow();
    expect(readPending()?.hash).toBe(pending.hash);
    expect(mocked.sendTransaction).not.toHaveBeenCalled();
  });
  it('ne conclut pas à une expiration si l’historique RPC ne couvre plus l’envoi', async () => {
    mocked.getTransaction.mockResolvedValue({
      status: 'NOT_FOUND',
      latestLedgerCloseTime: 9000,
      oldestLedgerCloseTime: 2000,
    });
    expect(await resume(() => {})).toBeNull();
    expect(readPending()).not.toBeNull();
  });
  it('libère une transaction expirée seulement après vérification', async () => {
    mocked.getTransaction.mockResolvedValue({
      status: 'NOT_FOUND',
      latestLedgerCloseTime: 1300,
      oldestLedgerCloseTime: 500,
    });
    await expect(resume(() => {})).rejects.toThrow('expirée');
    expect(readPending()).toBeNull();
  });
  it('un échec confirmé ne laisse pas une mise active', async () => {
    mocked.getTransaction.mockResolvedValue({ status: 'FAILED' });
    await expect(resume(() => {})).rejects.toThrow('échoué');
    expect(readPending()).toBeNull();
  });
  it('refuse de mélanger les déploiements', async () => {
    savePending({ ...pending, contractId: 'C' + 'A'.repeat(55) });
    await expect(resume(() => {})).rejects.toThrow('autre déploiement');
    expect(mocked.getTransaction).not.toHaveBeenCalled();
  });
  it('échoue avant envoi si le stockage est indisponible', () => {
    clearPending();
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('quota');
      },
      getItem: () => null,
    });
    expect(() => savePending(pending)).toThrow();
    expect(mocked.sendTransaction).not.toHaveBeenCalled();
  });
});
