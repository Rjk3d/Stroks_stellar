// =============================================================================
// npm run deploy
// Compile le contrat, le déploie sur le testnet, met 100 XLM dans la banque,
// puis génère le client TypeScript (/bindings) utilisé par play.js et le front.
// =============================================================================

import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { stellar } from "./lib/stellar-cli.js";

// 1. Compiler le contrat Rust en WebAssembly (.wasm).
stellar(["contract", "build"]);

// 2. L'adresse du contrat du XLM (sur Soroban, même le XLM est un contrat).
const tokenId = stellar(["contract", "id", "asset", "--asset", "native", "--network", "testnet"]);

// 3. Déployer notre contrat avec le compte "alice". Ce qui suit `--` est passé
//    au constructeur : `__constructor(token)`.
const contractId = stellar([
  "contract", "deploy",
  "--wasm", "target/wasm32v1-none/release/double_ou_rien.wasm",
  "--source-account", "alice",
  "--network", "testnet",
  "--", "--token", tokenId,
]);

// 4. Remplir la banque : alice envoie 100 XLM au contrat
//    (1 XLM = 10 000 000 stroops).
const alice = stellar(["keys", "address", "alice"]);
stellar([
  "contract", "invoke", "--id", tokenId, "--source-account", "alice", "--network", "testnet",
  "--", "transfer", "--from", alice, "--to", contractId, "--amount", "1000000000",
]);

// 5. Sur Stellar, stocker un contrat se paie comme un loyer, pour une durée
//    limitée. On le prolonge ici de ~30 jours (1 jour ≈ 17 280 ledgers de 5 s).
//    À relancer si le contrat doit vivre plus longtemps.
stellar([
  "contract", "extend", "--id", contractId, "--ledgers-to-extend", String(30 * 17_280),
  "--source-account", "alice", "--network", "testnet",
]);

// 6. Noter les adresses utiles.
writeFileSync("deployment.json", JSON.stringify({ contractId, tokenId }, null, 2) + "\n");

// 7. Générer le client TypeScript à partir du contrat déployé, le compiler,
//    puis l'installer dans le projet (voir "dependencies" dans package.json).
stellar([
  "contract", "bindings", "typescript",
  "--contract-id", contractId, "--network", "testnet",
  "--output-dir", "bindings", "--overwrite",
]);
const pkg = JSON.parse(readFileSync("bindings/package.json", "utf8"));
pkg.name = "double-ou-rien-client";
writeFileSync("bindings/package.json", JSON.stringify(pkg, null, 2) + "\n");
execSync("npm install && npm run build", { cwd: "bindings", stdio: "inherit" });
execSync("npm install", { stdio: "inherit" });

console.log(`\n✅ Contrat déployé : https://stellar.expert/explorer/testnet/contract/${contractId}`);
console.log("   Pour jouer : npm run play");
