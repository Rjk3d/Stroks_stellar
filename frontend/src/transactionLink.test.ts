import { describe, expect, it } from 'vitest';
import { transactionLink } from './transactionLink';

describe('lien vers la transaction réelle', () => {
  it('ouvre le dashboard Testnet et conserve le hash de chaque nouvelle manche', () => {
    const firstHash = 'a1'.repeat(32);
    const nextHash = 'b2'.repeat(32);
    for (const hash of [firstHash, nextHash]) {
      const url = new URL(transactionLink(hash));
      expect(url.origin + url.pathname).toBe('https://lab.stellar.org/transaction/dashboard');
      expect(url.search).toContain('network$id=testnet');
      expect(url.search).toContain('rpcUrl=https:////soroban-testnet.stellar.org');
      expect(url.search).toContain(`txDashboard$transactionHash=${hash};;`);
    }
    expect(transactionLink(nextHash)).not.toContain(firstHash);
  });

  it('ne crée aucun lien pour une simulation, un hash absent ou invalide', () => {
    for (const hash of [
      '',
      'demo-win',
      'abc',
      'g'.repeat(64),
      'a'.repeat(64) + '&network=mainnet',
    ]) {
      expect(transactionLink(hash)).toBe('');
    }
  });
});
