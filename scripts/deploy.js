// =============================================================================
// scripts/deploy.js — Compile, déploie le contrat sur le testnet, finance la
// banque et écrit deployment.json (lu par les autres scripts, l'indexeur et le front).
//
// Usage : npm run deploy     (ou : node scripts/deploy.js)
// =============================================================================

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stellar, NETWORK, RPC_URL, NETWORK_PASSPHRASE } from "./lib/stellar-cli.js";

// En module ES (import/export), `__dirname` n'existe pas : on le reconstruit.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WASM_PATH = join(ROOT, "target", "wasm32v1-none", "release", "double_ou_rien.wasm");

// Identité de la CLI qui paie le déploiement et devient admin du contrat.
const SOURCE = "alice";
// 1 XLM = 10 000 000 stroops (l'unité entière utilisée par les contrats).
const XLM = 10_000_000n; // `n` = BigInt : entiers de taille illimitée, comme i128 en Rust.
const BANK_FUNDING = 100n * XLM;

// Configuration initiale du jeu (modifiable ensuite avec set_config).
// Les i128 sont passés en CHAÎNES : JSON ne sait pas représenter les très grands entiers.
const CONFIG = {
  min_bet: (1n * XLM).toString(), // 1 XLM
  max_bet: (10n * XLM).toString(), // 10 XLM
  max_multiplier: 32, // au plus x32 (5 victoires d'affilée) ; chaque victoire double le pot
};

// ---------------------------------------------------------------------------
// 1. Compilation Rust → WASM (optimisé par la CLI).
// ---------------------------------------------------------------------------
stellar(["contract", "build"]);

// ---------------------------------------------------------------------------
// 2. Adresse du contrat du XLM natif.
// Sur Soroban, même le XLM est manipulé via un contrat : le "Stellar Asset
// Contract" (SAC). Son adresse est déterministe (dérivée de l'actif + réseau).
// ---------------------------------------------------------------------------
const tokenId = stellar(["contract", "id", "asset", "--asset", "native", "--network", NETWORK]);

// Adresse publique (G...) de alice : elle sera l'admin du contrat.
const adminAddress = stellar(["keys", "address", SOURCE]);

// ---------------------------------------------------------------------------
// 3. Déploiement = upload du WASM + création d'une instance + appel du
// constructeur, en une seule commande. Les arguments après `--` sont ceux
// du __constructor (même noms que dans le code Rust).
// L'alias permet ensuite d'écrire `--id double-ou-rien` dans la CLI.
// ---------------------------------------------------------------------------
const contractId = stellar([
  "contract", "deploy",
  "--wasm", WASM_PATH,
  "--source-account", SOURCE,
  "--network", NETWORK,
  "--alias", "double-ou-rien",
  "--",
  "--admin", adminAddress,
  "--token", tokenId,
  "--config", JSON.stringify(CONFIG),
]);

// ---------------------------------------------------------------------------
// 4. Financement de la banque : alice transfère 100 XLM au contrat en
// appelant la fonction `transfer` du contrat XLM.
// ---------------------------------------------------------------------------
stellar([
  "contract", "invoke",
  "--id", tokenId,
  "--source-account", SOURCE,
  "--network", NETWORK,
  "--",
  "transfer",
  "--from", adminAddress,
  "--to", contractId,
  "--amount", BANK_FUNDING.toString(),
]);

// ---------------------------------------------------------------------------
// 5. Numéro du ledger actuel : l'indexeur commencera à lire les événements
// à partir d'ici (inutile de fouiller avant le déploiement).
// Appel JSON-RPC direct avec fetch (intégré à Node 18+).
// ---------------------------------------------------------------------------
const response = await fetch(RPC_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger" }),
});
const { result } = await response.json();

// ---------------------------------------------------------------------------
// 6. deployment.json : la "carte d'identité" du déploiement.
// ---------------------------------------------------------------------------
const deployment = {
  network: NETWORK,
  networkPassphrase: NETWORK_PASSPHRASE,
  rpcUrl: RPC_URL,
  contractId,
  tokenId,
  admin: adminAddress,
  deployLedger: result.sequence,
  deployedAt: new Date().toISOString(),
  config: CONFIG,
};
writeFileSync(join(ROOT, "deployment.json"), JSON.stringify(deployment, null, 2) + "\n");

console.log("\n✅ Déploiement terminé :");
console.log(deployment);
console.log(`🔎 https://stellar.expert/explorer/testnet/contract/${contractId}`);
