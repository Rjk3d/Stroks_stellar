// =============================================================================
// npm run play
// Une vraie partie sur le testnet, dans le terminal : tu choisis ta mise et
// ton coup, le contrat tire celui de la banque et paie (ou encaisse).
// C'est aussi l'exemple à suivre pour le front (mêmes appels au contrat).
// =============================================================================

import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
// Le client généré par `npm run deploy` (il contient aussi le SDK Stellar).
import { Client, Move, Outcome, Keypair, contract, rpc } from "double-ou-rien-client";
import { stellar } from "./lib/stellar-cli.js";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK = "Test SDF Network ; September 2015"; // identifiant du testnet
const { contractId } = JSON.parse(readFileSync("deployment.json", "utf8"));

// --- Le joueur : un compte "player1" créé une fois et financé par Friendbot ---
if (!stellar(["keys", "ls"]).split(/\r?\n/).includes("player1")) {
  stellar(["keys", "generate", "player1", "--network", "testnet", "--fund"]);
}
// Démo uniquement : on lit la clé secrète pour signer. Dans le front,
// c'est le portefeuille Freighter qui signe, la clé ne sort jamais.
const keypair = Keypair.fromSecret(stellar(["keys", "secret", "player1"]));
const player = keypair.publicKey();

// --- Le client du contrat : quel contrat, quel réseau, qui signe ---
const client = new Client({
  contractId,
  networkPassphrase: NETWORK,
  rpcUrl: RPC_URL,
  publicKey: player,
  ...contract.basicNodeSigner(keypair, NETWORK),
});

// Solde XLM du joueur, lu directement sur la blockchain.
const server = new rpc.Server(RPC_URL);
async function getBalance() {
  const account = await server.getAccountEntry(player);
  return Number(account.balance().toBigInt()) / 1e7; // stroops → XLM
}

const NAMES = { [Move.Rock]: "Pierre", [Move.Paper]: "Feuille", [Move.Scissors]: "Ciseaux" };
const CHOICES = { p: Move.Rock, f: Move.Paper, c: Move.Scissors };
const ERRORS = { InvalidBet: "La mise doit être positive.", BankTooPoor: "La banque n'a pas assez d'XLM pour cette mise." };

// Lire les réponses tapées dans le terminal, une ligne à la fois.
const input = createInterface({ input: process.stdin });
const lines = input[Symbol.asyncIterator]();
async function ask(question) {
  process.stdout.write(question);
  const { value, done } = await lines.next();
  if (done) process.exit(0); // plus rien à lire (Ctrl+C / fin de l'entrée)
  return value.trim().toLowerCase();
}

const startBalance = await getBalance();
console.log(`\n🎰 Joueur ${player}\n💼 Solde : ${startBalance} XLM\n`);

let again = true;
while (again) {
  // 1. Les choix du joueur.
  const betXlm = Number((await ask("Mise en XLM (ex. 1) : ")) || 1);
  let choice = "";
  while (!CHOICES.hasOwnProperty(choice)) {
    choice = await ask("Ton coup : (p)ierre, (f)euille ou (c)iseaux ? ");
  }
  const myMove = CHOICES[choice];
  const bet = BigInt(Math.round(betXlm * 1e7)); // XLM → stroops (entier)

  // 2. Préparer la transaction : le SDK la SIMULE pour calculer les frais.
  //    Si le contrat renvoie une erreur, on la voit ici sans rien payer.
  const tx = await client.play({ player, player_move: myMove, bet });
  if (tx.result.isErr()) {
    const name = tx.result.unwrapErr().message;
    console.log(`❌ ${ERRORS[name] ?? name}\n`);
    continue;
  }

  // 3. Signer, envoyer, attendre la confirmation (~5 s).
  //    Attention : le résultat de la simulation n'est pas le vrai (le hasard
  //    change) : on lit le résultat de la transaction confirmée.
  console.log("⏳ Envoi de la transaction...");
  const sent = await tx.signAndSend();
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    console.log("❌ La transaction a échoué, réessaie.\n");
    continue;
  }
  const round = sent.result.unwrap(); // { bank_move, outcome, payout }

  // 4. Afficher le résultat.
  const net = (Number(round.payout) - Number(bet)) / 1e7;
  const text = {
    [Outcome.Win]: `🎉 Gagné ! +${net} XLM`,
    [Outcome.Tie]: "🤝 Égalité, mise remboursée.",
    [Outcome.Loss]: `💀 Perdu... ${net} XLM`,
  }[round.outcome];
  console.log(`Toi : ${NAMES[myMove]}  |  Banque : ${NAMES[round.bank_move]}  →  ${text}`);
  console.log(`🔗 https://stellar.expert/explorer/testnet/tx/${sent.sendTransactionResponse.hash}`);
  console.log(`💼 Solde : ${await getBalance()} XLM\n`);

  again = (await ask("Rejouer ? (o/n) ")) === "o";
}

// 5. Bilan (les frais de transaction sont inclus dans la différence).
const endBalance = await getBalance();
const diff = Math.round((endBalance - startBalance) * 1e7) / 1e7;
console.log(`\n📊 Bilan : ${startBalance} → ${endBalance} XLM (${diff >= 0 ? "+" : ""}${diff} XLM, frais compris)`);
input.close();
