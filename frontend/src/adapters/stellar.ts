import {
  Client,
  networks,
  rpc,
  TransactionBuilder,
  contract,
  type Round as ContractRound,
} from 'double-ou-rien-client';
import {
  getAddress,
  getNetwork,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';
import {
  MOVES,
  sleep,
  type Balance,
  type Move,
  type Pending,
  type Progress,
  type Round,
} from '../game';
import { clearPending, readPending, savePending } from '../storage';

export const CONFIG = { ...networks.testnet, rpcUrl: 'https://soroban-testnet.stellar.org' };
const server = new rpc.Server(CONFIG.rpcUrl, { timeout: 15 });
function clientFor(publicKey?: string) {
  return new Client({ ...CONFIG, publicKey });
}

async function verifyWallet(address?: string) {
  const installed = await isConnected();
  if (!installed.isConnected || installed.error)
    throw new Error(
      'Freighter est absent ou indisponible. Installe ou déverrouille l’extension dans ton navigateur.',
    );
  const network = await getNetwork();
  if (network.error || network.networkPassphrase !== CONFIG.networkPassphrase)
    throw new Error('Passe Freighter sur Stellar Testnet, puis réessaie.');
  const current = await getAddress();
  if (current.error || !current.address)
    throw new Error('Le portefeuille est déconnecté. Reconnecte Freighter.');
  if (address && current.address !== address)
    throw new Error('Le compte Freighter a changé. Reconnecte le portefeuille avant de jouer.');
  return current.address;
}
export async function connect(): Promise<string> {
  const installed = await isConnected();
  if (!installed.isConnected || installed.error)
    throw new Error(
      'Freighter est absent ou indisponible. Installe ou déverrouille l’extension dans ton navigateur.',
    );
  const response = await requestAccess();
  if (response.error || !response.address)
    throw new Error('Connexion Freighter refusée. Tu peux réessayer ou utiliser la démo.');
  return verifyWallet(response.address);
}
export async function readBalance(address: string): Promise<Balance> {
  const [account, latest] = await Promise.all([
    server.getAccountEntry(address),
    server.getLatestLedger(),
  ]);
  const ledgers = await server.getLedgers({
    startLedger: latest.sequence,
    pagination: { limit: 1 },
  });
  if (!ledgers.ledgers[0])
    throw new Error('Impossible de calculer la réserve du compte. Réessaie.');
  const baseReserve = BigInt(ledgers.ledgers[0].headerXdr.header().baseReserve());
  let selling = 0n;
  let sponsoring = 0;
  let sponsored = 0;
  if (account.ext().switch() === 1) {
    const v1 = account.ext().v1();
    selling = v1.liabilities().selling().toBigInt();
    if (v1.ext().switch() === 2) {
      sponsoring = v1.ext().v2().numSponsoring();
      sponsored = v1.ext().v2().numSponsored();
    }
  }
  const total = account.balance().toBigInt();
  const reserve = BigInt(2 + account.numSubEntries() + sponsoring - sponsored) * baseReserve;
  const available = total - reserve - selling;
  return { total, available: available > 0n ? available : 0n };
}

function confirmedRound(p: Pending, response: rpc.Api.GetSuccessfulTransactionResponse): Round {
  if (!response.returnValue)
    throw new Error(
      'Transaction confirmée, mais résultat indisponible. Conserve sa référence pour vérification.',
    );
  const result = clientFor(p.address).spec.funcResToNative(
    'play',
    response.returnValue,
  ) as contract.Result<ContractRound>;
  if (result.isErr()) throw new Error(result.unwrapErr().message);
  const round = result.unwrap();
  if (
    !MOVES[round.bank_move] ||
    !['win', 'tie', 'loss'][round.outcome] ||
    typeof round.payout !== 'bigint'
  )
    throw new Error('Résultat du contrat non reconnu. Conserve la référence de transaction.');
  return {
    playerMove: p.move,
    bankMove: MOVES[round.bank_move],
    outcome: (['win', 'tie', 'loss'] as const)[round.outcome],
    bet: BigInt(p.bet),
    payout: round.payout,
    hash: p.hash,
    mode: 'testnet',
    fee: response.resultXdr.feeCharged().toBigInt(),
  };
}
export async function resume(onProgress: (p: Progress) => void): Promise<Round | null> {
  const p = readPending();
  if (!p) return null;
  if (p.network !== CONFIG.networkPassphrase || p.contractId !== CONFIG.contractId)
    throw new Error(
      'Cette transaction appartient à un autre déploiement. Vérifie son état avant de changer de contrat.',
    );
  onProgress({ phase: 'pending', hash: p.hash });
  const response = await server.getTransaction(p.hash);
  if (response.status === 'SUCCESS') {
    const round = confirmedRound(p, response);
    clearPending();
    return round;
  }
  if (response.status === 'FAILED') {
    clearPending();
    throw new Error(
      'La transaction a échoué : la mise n’a pas été transférée. Des frais réseau peuvent avoir été prélevés.',
    );
  }
  // Only prove expiry when RPC history covers the submission window and its
  // latest closed ledger is past the transaction's maximum time.
  if (
    p.expiresAt > 0 &&
    response.latestLedgerCloseTime > p.expiresAt + 30 &&
    response.oldestLedgerCloseTime < p.createdAt / 1000 - 30
  ) {
    clearPending();
    throw new Error(
      'Transaction expirée sans confirmation. Tu peux choisir à nouveau et signer une nouvelle manche.',
    );
  }
  return null;
}
export async function play(
  address: string,
  move: Move,
  bet: bigint,
  onProgress: (p: Progress) => void,
  cancelled = () => false,
): Promise<Round | null> {
  if (readPending())
    throw new Error('Une transaction est déjà en attente. Vérifie-la avant de rejouer.');
  await verifyWallet(address);
  onProgress({ phase: 'preparing' });
  const tx = await clientFor(address).play(
    { player: address, player_move: MOVES.indexOf(move), bet },
    { simulate: false, timeoutInSeconds: 180 },
  );
  await tx.simulate({ restore: false });
  // Only inspect simulation errors. Never use its randomly predicted outcome.
  if (tx.result.isErr()) throw new Error(tx.result.unwrapErr().message);
  if (!tx.built) throw new Error('La transaction n’a pas pu être préparée.');
  if (tx.needsNonInvokerSigningBy().length)
    throw new Error(
      'Le contrat demande une autorisation supplémentaire non prévue. Contacte l’équipe back.',
    );
  const fee = BigInt(tx.built.fee);
  const balance = await readBalance(address);
  if (balance.available < bet + fee)
    throw new Error('Solde insuffisant pour la mise, les réserves et les frais réseau.');
  await verifyWallet(address);
  if (cancelled()) throw new Error('Préparation abandonnée. Aucune transaction envoyée.');
  onProgress({ phase: 'signing', fee });
  await tx.sign({
    signTransaction: async (xdr, options) => {
      await verifyWallet(address);
      const signed = await signTransaction(xdr, {
        ...options,
        address,
        networkPassphrase: CONFIG.networkPassphrase,
      });
      if (signed.error || !signed.signedTxXdr)
        throw new Error(signed.error?.message || 'Signature refusée.');
      if (signed.signerAddress && signed.signerAddress !== address)
        throw new Error('La signature provient d’un autre compte. Aucune transaction envoyée.');
      return signed;
    },
  });
  if (!tx.signed) throw new Error('Aucune transaction signée.');
  await verifyWallet(address);
  if (cancelled()) throw new Error('Préparation abandonnée. Aucune transaction envoyée.');
  const signed = TransactionBuilder.fromXDR(tx.signed.toXDR(), CONFIG.networkPassphrase);
  if (signed.hash().toString('hex') !== tx.built.hash().toString('hex'))
    throw new Error('La transaction signée ne correspond pas à la mise préparée.');
  const hash = signed.hash().toString('hex');
  const expiresAt = Number(tx.built.timeBounds?.maxTime ?? 0);
  savePending({
    version: 1,
    hash,
    address,
    contractId: CONFIG.contractId,
    network: CONFIG.networkPassphrase,
    bet: bet.toString(),
    move,
    expiresAt,
    createdAt: Date.now(),
  });
  onProgress({ phase: 'sending', hash });
  // Any transport exception leaves the reference intact: never blindly retry.
  const sent = await server.sendTransaction(signed);
  if (sent.status === 'ERROR') {
    const response = await server.getTransaction(hash);
    if (response.status === 'SUCCESS') {
      const round = confirmedRound(readPending()!, response);
      clearPending();
      return round;
    }
    if (response.status === 'NOT_FOUND' || response.status === 'FAILED') {
      clearPending();
      throw new Error('Le réseau a rejeté la transaction. Actualise le solde avant de réessayer.');
    }
  }
  onProgress({ phase: 'pending', hash });
  for (let attempt = 0; attempt < 8; attempt++) {
    await sleep(Math.min(1500 + attempt * 500, 3500));
    const round = await resume(onProgress);
    if (round) return round;
  }
  return null;
}
