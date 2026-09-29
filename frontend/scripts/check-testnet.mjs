// Read-only: no account creation, wallet access, signing or transaction submission.
import { readFile } from 'node:fs/promises';
import { contract, rpc, networks } from 'double-ou-rien-client';

const deployment = JSON.parse(
  await readFile(new URL('../../deployment.json', import.meta.url), 'utf8'),
);
const config = { ...networks.testnet, rpcUrl: 'https://soroban-testnet.stellar.org' };
if (deployment.contractId !== config.contractId)
  throw new Error('deployment.json et bindings ne ciblent pas le même contrat.');
const server = new rpc.Server(config.rpcUrl, { timeout: 15 });
console.log('Réseau :', (await server.getNetwork()).passphrase);
console.log('RPC :', (await server.getHealth()).status);
await contract.Client.from(config);
console.log('Contrat accessible :', config.contractId);
const token = await contract.Client.from({ ...config, contractId: deployment.tokenId });
const response = await token.balance({ id: config.contractId });
const balance = BigInt(response.result);
console.log('Banque (stroops) :', balance.toString());
console.log(
  'Banque (XLM) :',
  `${balance / 10_000_000n}.${(balance % 10_000_000n).toString().padStart(7, '0')}`,
);
const ledger = await server.getLatestLedger();
const headers = await server.getLedgers({ startLedger: ledger.sequence, pagination: { limit: 1 } });
console.log('Réserve de base (stroops) :', headers.ledgers[0].headerXdr.header().baseReserve());
