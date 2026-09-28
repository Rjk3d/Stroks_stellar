// Petit utilitaire : lancer la commande `stellar` (la CLI) depuis Node.js
// et récupérer ce qu'elle affiche.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Sous Windows, la CLI est souvent installée ici sans être dans le PATH.
const WINDOWS_PATH = "C:\\Program Files (x86)\\Stellar CLI\\stellar.exe";
const STELLAR = existsSync(WINDOWS_PATH) ? WINDOWS_PATH : "stellar";

// `stellar build` a besoin de `cargo` : on ajoute son dossier au PATH.
const env = { ...process.env, PATH: `${process.env.USERPROFILE}\\.cargo\\bin;${process.env.PATH}` };

/** Lance `stellar <args>` et renvoie le texte affiché. */
export function stellar(args) {
  console.log(`> stellar ${args.join(" ")}`);
  return execFileSync(STELLAR, args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "inherit"] }).trim();
}
