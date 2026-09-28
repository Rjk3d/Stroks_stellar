# 4. Guide front : brancher l'interface au contrat

## Schéma
```
 Navigateur                                   Stellar testnet
 ┌─────────────────────────┐                  ┌──────────────────────────┐
 │ Front (React, Vite...)  │── simulation ──▶ │ RPC                      │
 │   client.play(...)      │── envoi ───────▶ │   → contrat Double ou Rien│
 │          │ signature    │◀── résultat ──── │     (la banque en XLM)   │
 │          ▼              │                  └──────────────────────────┘
 │ Extension Freighter     │  garde les clés du joueur et signe
 └─────────────────────────┘
```

## 1. Ce qu'il faut récupérer du back
- le dossier **`bindings/`** (client TypeScript généré par `npm run deploy`) ;
- la référence qui marche : **`scripts/play.js`**, qui fait exactement les mêmes appels.

⚠️ Si le back redéploie le contrat, l'adresse change : il faut récupérer le **nouveau** `bindings/`.

## 2. Installation
```bash
npm install ../chemin-vers-le-back/bindings @stellar/freighter-api
```
- `double-ou-rien-client` : le contrat (et le SDK Stellar inclus) ;
- `@stellar/freighter-api` : parler au portefeuille **Freighter**.

Côté joueur : installer l'extension [Freighter](https://www.freighter.app/), créer un compte,
passer sur **Testnet** dans ses réglages, puis le financer (bouton Friendbot dans Freighter).

## 3. Connexion au portefeuille + client
```ts
import { Client, Move, Outcome, networks } from "double-ou-rien-client";
import { requestAccess, signTransaction } from "@stellar/freighter-api";

const RPC_URL = "https://soroban-testnet.stellar.org";
const { networkPassphrase, contractId } = networks.testnet; // déjà dans les bindings

export async function connect() {
  // Ouvre la popup Freighter et renvoie l'adresse G... du joueur.
  const { address, error } = await requestAccess();
  if (error) throw new Error("Connexion Freighter refusée");

  const client = new Client({
    contractId,
    networkPassphrase,
    rpcUrl: RPC_URL,
    publicKey: address, // le joueur paie les frais
    // Au moment de signer, le SDK appelle Freighter, qui ouvre sa popup.
    signTransaction: (xdr: string) => signTransaction(xdr, { networkPassphrase, address }),
  });
  return { address, client };
}
```

## 4. Jouer une partie
```ts
const XLM = 10_000_000n; // 1 XLM en stroops (bigint)

export async function playRound(client: Client, address: string, move: Move, betXlm: number) {
  const bet = BigInt(Math.round(betXlm * 1e7));

  // a) Simulation (gratuite) : détecte les erreurs avant de demander une signature.
  const tx = await client.play({ player: address, player_move: move, bet });
  if (tx.result.isErr()) {
    throw new Error(ERRORS[tx.result.unwrapErr().message] ?? "Erreur inconnue");
  }

  // b) Signature (popup Freighter), envoi, attente (~5 s).
  const sent = await tx.signAndSend();
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error("La transaction a échoué, réessayez.");
  }

  // c) Le VRAI résultat (pas celui de la simulation : le hasard y est différent).
  const round = sent.result.unwrap();
  return {
    bankMove: round.bank_move,               // Move.Rock / Paper / Scissors
    outcome: round.outcome,                  // Outcome.Win / Tie / Loss
    payout: Number(round.payout) / 1e7,      // XLM rendus au joueur
    txUrl: `https://stellar.expert/explorer/testnet/tx/${sent.sendTransactionResponse!.hash}`,
  };
}
```

Afficher le résultat :
```ts
const NAMES = { [Move.Rock]: "Pierre", [Move.Paper]: "Feuille", [Move.Scissors]: "Ciseaux" };
const TEXT = { [Outcome.Win]: "Gagné !", [Outcome.Tie]: "Égalité", [Outcome.Loss]: "Perdu" };
// `Toi : ${NAMES[move]} | Banque : ${NAMES[r.bankMove]} → ${TEXT[r.outcome]}`
```

## 5. Les erreurs à afficher
```ts
const ERRORS: Record<string, string> = {
  InvalidBet: "La mise doit être supérieure à 0.",           // code 1
  BankTooPoor: "La banque n'a pas assez d'XLM pour cette mise.", // code 2
};
```
| Situation | Message |
|---|---|
| Freighter pas installé | « Installez l'extension Freighter » |
| Le joueur refuse dans la popup | « Transaction annulée » (exception de `signAndSend`) |
| Freighter pas sur Testnet | « Passez Freighter sur le réseau Testnet » |
| Pas assez d'XLM sur le compte | la simulation échoue : « Solde insuffisant » |

## 6. Afficher le solde du joueur
```ts
import { rpc } from "double-ou-rien-client";
const server = new rpc.Server(RPC_URL);
const account = await server.getAccountEntry(address);
const balanceXlm = Number(account.balance().toBigInt()) / 1e7;
```

## 7. Checklist
- [ ] `bindings/` et `@stellar/freighter-api` installés
- [ ] Freighter sur **Testnet**, compte financé
- [ ] Bouton « Connecter » → `connect()`
- [ ] Choix de la mise + 3 boutons Pierre / Feuille / Ciseaux → `playRound()`
- [ ] Affichage : coup de la banque, résultat, gain, lien de la transaction
- [ ] Solde rafraîchi après chaque partie
- [ ] Messages d'erreur (tableau ci-dessus)

> Si Vite affiche une erreur `Buffer` ou `global is not defined` :
> `npm install buffer`, et dans `vite.config.ts` : `define: { global: "globalThis" }`.
