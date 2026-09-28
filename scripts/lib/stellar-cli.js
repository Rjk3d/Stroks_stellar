// =============================================================================
// scripts/lib/stellar-cli.js — Petit utilitaire partagé par nos scripts :
// trouver la Stellar CLI et l'exécuter depuis Node.js.
//
// Pourquoi passer par Node plutôt que par un script PowerShell ou bash ?
// → Les mêmes scripts marchent sous Windows, macOS et Linux, et on évite
//   l'enfer des guillemets PowerShell pour passer du JSON en argument.
// =============================================================================

// `node:` indique un module intégré à Node.js (aucune installation requise).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";

// Réglages réseau communs à tous les scripts.
export const NETWORK = "testnet";
export const RPC_URL = "https://soroban-testnet.stellar.org";
// La "passphrase" identifie le réseau. Elle est incluse dans ce qui est signé :
// une transaction signée pour le testnet ne peut PAS être rejouée sur le mainnet.
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

/** Emplacement de l'exécutable `stellar`. */
function findStellarBinary() {
  // 1. Variable d'environnement explicite (prioritaire).
  if (process.env.STELLAR_BIN) return process.env.STELLAR_BIN;
  // 2. Emplacements par défaut de l'installeur Windows.
  const candidates = [
    "C:\\Program Files (x86)\\Stellar CLI\\stellar.exe",
    "C:\\Program Files\\Stellar CLI\\stellar.exe",
  ];
  const found = candidates.find((path) => existsSync(path));
  // 3. Sinon, on espère qu'il est dans le PATH.
  return found ?? "stellar";
}

const STELLAR_BIN = findStellarBinary();

// `stellar contract build` appelle `cargo` : on ajoute le dossier de cargo au
// PATH du processus enfant, au cas où le terminal ne l'aurait pas.
const childEnv = {
  ...process.env,
  PATH: [join(homedir(), ".cargo", "bin"), process.env.PATH ?? process.env.Path].join(delimiter),
};

/**
 * Exécute `stellar <args...>` et renvoie sa sortie standard (sans espaces autour).
 *
 * execFileSync lance le programme DIRECTEMENT, sans shell : chaque élément du
 * tableau `args` est un argument, même s'il contient des espaces ou des
 * guillemets (très pratique pour passer du JSON).
 * La sortie d'erreur (stderr), où la CLI écrit ses logs, est affichée telle quelle.
 */
export function stellar(args) {
  console.log(`\n$ stellar ${args.join(" ")}`);
  const output = execFileSync(STELLAR_BIN, args, {
    encoding: "utf8",
    env: childEnv,
    stdio: ["ignore", "pipe", "inherit"],
  });
  return output.trim();
}
