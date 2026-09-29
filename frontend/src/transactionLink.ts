/** Stellar Lab reads the confirmed transaction directly from the Testnet RPC. */
export function transactionLink(hash: string): string {
  if (!/^[0-9a-f]{64}$/i.test(hash)) return '';

  // Lab uses zustand-querystring, not conventional URLSearchParams. Keep its
  // network state in the link so a visitor's previously selected network is ignored.
  return (
    'https://lab.stellar.org/transaction/dashboard?$=network$id=testnet' +
    '&label=Testnet&horizonUrl=https:////horizon-testnet.stellar.org' +
    '&rpcUrl=https:////soroban-testnet.stellar.org' +
    '&passphrase=Test%20SDF%20Network%20/;%20September%202015;' +
    `&txDashboard$transactionHash=${hash};;`
  );
}
