// =============================================================================
// scripts/bindings.js — Génère le client TypeScript du contrat dans /bindings.
//
// Les "bindings" sont un petit paquet npm GÉNÉRÉ AUTOMATIQUEMENT à partir de
// l'interface du contrat (stockée DANS le WASM déployé : noms des fonctions,
// types des paramètres, structs, enums, codes d'erreur). Le front n'a donc
// jamais à écrire d'encodage XDR à la main : il appelle
// `client.start({ player, player_move, bet })` avec de vrais types TypeScript.
//
// Usage : npm run bindings   (à relancer après chaque redéploiement)
// =============================================================================

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stellar, NETWORK } from "./lib/stellar-cli.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BINDINGS_DIR = join(ROOT, "bindings");

// On lit l'ID du contrat écrit par deploy.js.
const { contractId } = JSON.parse(readFileSync(join(ROOT, "deployment.json"), "utf8"));

// 1. Génération : la CLI télécharge l'interface du contrat déployé sur le
//    testnet et écrit un projet TypeScript complet (package.json, src/index.ts).
//    L'ID du contrat et la passphrase réseau y sont inscrits en constantes.
stellar([
  "contract", "bindings", "typescript",
  "--contract-id", contractId,
  "--network", NETWORK,
  "--output-dir", BINDINGS_DIR,
  "--overwrite",
]);

// 2. La CLI nomme le paquet d'après le dossier ("bindings"). On lui donne un
//    nom explicite : le front écrira `import ... from "double-ou-rien-client"`.
const pkgPath = join(BINDINGS_DIR, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = "double-ou-rien-client";
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// 3. Installation des dépendances du paquet généré, puis compilation
//    TypeScript → JavaScript (dossier bindings/dist).
//    `shell: true` est nécessaire sous Windows : `npm` y est un script `npm.cmd`.
const run = (command, cwd) => {
  console.log(`\n$ ${command}   (dans ${cwd})`);
  execFileSync(command, { cwd, stdio: "inherit", shell: true });
};
run("npm install", BINDINGS_DIR);
run("npm run build", BINDINGS_DIR);

// 4. Installation à la racine : le package.json racine dépend de
//    "file:./bindings", ce qui permet à play-demo.js de l'importer par son nom.
run("npm install", ROOT);

console.log("\n✅ Bindings prêts : import { Client, Move, ... } from 'double-ou-rien-client'");
