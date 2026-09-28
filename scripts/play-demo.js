// =============================================================================
// scripts/play-demo.js — Joue une VRAIE partie sur le testnet en ligne de
// commande, via les bindings TypeScript générés.
//
// 👉 C'est le script de RÉFÉRENCE pour le développeur front : chaque appel au
//    contrat est fait exactement comme dans une appli web. Seule différence :
//    ici on signe avec une clé secrète locale, alors que le front fera signer
//    l'utilisateur avec son portefeuille Freighter (voir docs/05).
//
// Usage :
//   npm run demo                → mise 1 XLM, encaisse dès le 1er gain (x2)
//   npm run demo -- 2 4         → mise 2 XLM, tente d'atteindre x4 avant d'encaisser
// =============================================================================

// Tout vient du paquet généré par `npm run bindings` :
//  - Client, Move, Outcome : générés à partir du contrat ;
//  - Keypair, contract : ré-exportés depuis @stellar/stellar-sdk.
import { Client, Move, Outcome, Keypair, contract } from "double-ou-rien-client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stellar, NETWORK } from "./lib/stellar-cli.js";
import { addResourceMargin } from "./lib/resource-margin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const deployment = JSON.parse(readFileSync(join(ROOT, "deployment.json"), "utf8"));

const XLM = 10_000_000n; // stroops par XLM (BigInt, car les i128 Rust deviennent des bigint en JS)
const PLAYER_IDENTITY = "player1";

// Arguments de la ligne de commande : mise (en XLM) et multiplicateur visé.
const betXlm = Number(process.argv[2] ?? 1);
const targetMultiplier = Number(process.argv[3] ?? 2);
const bet = BigInt(Math.round(betXlm * 10_000_000));

/** Affiche un montant en stroops en XLM lisible. */
const fmt = (stroops) => `${Number(stroops) / 1e7} XLM`;

// -----------------------------------------------------------------------------
// 1. Un compte joueur sur le testnet.
// On crée (une seule fois) une identité CLI "player1" financée par Friendbot.
// Un joueur distinct de l'admin rend la démo plus réaliste.
// -----------------------------------------------------------------------------
const identities = stellar(["keys", "ls"]).split(/\r?\n/);
if (!identities.includes(PLAYER_IDENTITY)) {
  stellar(["keys", "generate", PLAYER_IDENTITY, "--network", NETWORK, "--fund"]);
}
// ⚠️ Lire une clé secrète n'est acceptable QUE pour un script de démo sur
// testnet. Dans le front, la clé ne quitte JAMAIS Freighter.
const keypair = Keypair.fromSecret(stellar(["keys", "secret", PLAYER_IDENTITY]));
const player = keypair.publicKey();

// -----------------------------------------------------------------------------
// 2. Le client du contrat.
// - contractId / networkPassphrase / rpcUrl : QUEL contrat, sur QUEL réseau.
// - publicKey : le compte "source" qui paiera les frais des transactions.
// - signTransaction : la fonction de signature. Ici basicNodeSigner (clé
//   locale) ; dans le front ce sera celle de Freighter.
// -----------------------------------------------------------------------------
const client = new Client({
  contractId: deployment.contractId,
  networkPassphrase: deployment.networkPassphrase,
  rpcUrl: deployment.rpcUrl,
  publicKey: player,
  ...contract.basicNodeSigner(keypair, deployment.networkPassphrase),
});

// -----------------------------------------------------------------------------
// 3. Fonctions utilitaires
// -----------------------------------------------------------------------------

/**
 * LECTURE : appeler une méthode du client construit une transaction ET la
 * SIMULE auprès du RPC. Pour une fonction de lecture, le résultat de la
 * simulation suffit : pas de signature, pas de frais, instantané.
 * Chaque appel renvoie un `AssembledTransaction` ; `.result` = la valeur.
 */
async function read(label, promise) {
  const tx = await promise;
  console.log(`📖 ${label} :`, tx.result);
  return tx.result;
}

/**
 * ÉCRITURE : 3 temps.
 *  a) `await client.xxx(...)` → construit + simule. La simulation calcule les
 *     frais, les données touchées, les autorisations... et détecte déjà les
 *     erreurs du contrat (mise trop basse, etc.) SANS rien payer.
 *  b) Si la simulation renvoie une erreur métier : on s'arrête avant de signer.
 *  c) `signAndSend()` → signe, envoie au réseau, puis attend (polling) que la
 *     transaction soit incluse dans un ledger (~5 s).
 *
 * ⚠️ Pour start/play, le résultat de la SIMULATION n'est PAS le vrai
 * résultat : le hasard (prng) de la simulation diffère de celui du ledger.
 * On lit donc toujours le résultat dans la transaction ENVOYÉE (`sent.result`).
 */
async function write(label, promise) {
  const tx = await promise;

  // Marge de ressources : le hasard de la simulation n'est pas celui du vrai
  // ledger, le vrai tour peut coûter plus cher (voir lib/resource-margin.js).
  // À faire AVANT de lire tx.result (le SDK met la simulation en cache).
  addResourceMargin(tx);

  // Pour les fonctions qui renvoient Result<T, Error>, `tx.result` est un
  // objet Ok(...) ou Err(...). Une erreur de contrat donne
  // Err({ message: "BetTooLow" }) : le nom de la variante Rust.
  if (tx.result.isErr()) {
    throw new Error(`${label} refusé par le contrat : ${tx.result.unwrapErr().message}`);
  }

  const sent = await tx.signAndSend();
  const hash = sent.sendTransactionResponse?.hash;
  // Le SDK n'échoue PAS toujours bruyamment : on vérifie le statut final.
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error(`${label} a échoué on-chain (${sent.getTransactionResponse?.status}) : ${hash}`);
  }
  console.log(`✍️  ${label} confirmé → https://stellar.expert/explorer/testnet/tx/${hash}`);
  // `.unwrap()` extrait la valeur de Ok(valeur) (lève une exception si Err).
  return sent.result.unwrap();
}

/** Un coup au hasard (côté joueur, on peut bien utiliser Math.random !). */
const randomMove = () => [Move.Rock, Move.Paper, Move.Scissors][Math.floor(Math.random() * 3)];

// -----------------------------------------------------------------------------
// 4. La partie
// -----------------------------------------------------------------------------
console.log(`\n🎰 Joueur ${player}`);
console.log(`   Mise ${fmt(bet)}, objectif x${targetMultiplier}\n`);

const config = await read("get_config", client.get_config());
await read("get_bank", client.get_bank());

// Une partie peut exister si un lancement précédent a été interrompu :
// `get_game` renvoie alors l'objet Game, sinon `null` (Option::None en Rust).
// `== null` (double égal) couvre à la fois null et undefined.
let game = await read("get_game", client.get_game({ player }));

let outcome;
if (game == null) {
  const mv = randomMove();
  console.log(`\n▶️  start : je joue ${Move[mv]}`);
  // Les noms des paramètres sont ceux de la fonction Rust (snake_case).
  outcome = await write("start", client.start({ player, player_move: mv, bet }));
} else {
  console.log("\n↩️  Partie existante reprise.");
  outcome = Outcome.Tie; // on force la boucle à jouer au moins un tour
}

// Boucle de jeu : on rejoue en cas d'égalité ou tant que l'objectif n'est pas atteint.
for (let round = 0; round < 30; round++) {
  // `Outcome[outcome]` : un enum TypeScript permet de retrouver le nom ("Win").
  console.log(`   → résultat : ${Outcome[outcome]}`);
  if (outcome === Outcome.Loss) {
    console.log("\n💀 Perdu ! Le pot revient à la banque.");
    break;
  }

  game = await read("get_game", client.get_game({ player }));
  const multiplier = 2 ** game.wins;
  console.log(`   pot actuel ${fmt(game.pot)} (x${multiplier}, ${game.rounds} tour(s))`);

  // Encaisser si l'objectif est atteint, ou si le max du contrat l'impose.
  if (game.wins > 0 && (multiplier >= targetMultiplier || multiplier * 2 > config.max_multiplier)) {
    const paid = await write("cash_out", client.cash_out({ player }));
    console.log(`\n💰 Encaissé : ${fmt(paid)} !`);
    break;
  }

  const mv = randomMove();
  console.log(`\n▶️  play : je joue ${Move[mv]}`);
  outcome = await write("play", client.play({ player, player_move: mv }));
}

// Les statistiques cumulées du joueur, stockées on-chain.
await read("get_stats", client.get_stats({ player }));
await read("get_bank", client.get_bank());
