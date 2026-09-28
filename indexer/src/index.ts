// =============================================================================
// index.ts — Point d'entrée de l'indexeur : `npm start` (dans /indexer)
// ou `npm run indexer` (à la racine).
//
// POURQUOI UN INDEXEUR, alors que la blockchain stocke déjà tout ?
//  1. Le RPC ne garde les événements que ~7 jours : au-delà, l'historique
//     disparaît de l'API (il faudrait un fournisseur d'archives payant).
//  2. Le RPC ne sait PAS faire de requêtes : impossible de lui demander
//     "les 10 plus gros gains" ou "tout ce qu'a fait l'adresse G...".
//  3. Le contrat lui-même ne peut pas non plus : parcourir tous les joueurs
//     on-chain coûterait énormément (et on ne stocke pas de liste de joueurs).
// L'indexeur lit les événements au fil de l'eau et les range dans une base SQL
// interrogeable instantanément. La blockchain reste la source de vérité :
// on peut toujours supprimer la base et tout reconstruire (dans la limite de
// la rétention du RPC).
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "./db.ts";
import { startPoller } from "./poller.ts";
import { createApi } from "./api.ts";

// `import.meta.dirname` : dossier de ce fichier (Node >= 20.11).
const ROOT = join(import.meta.dirname, "..", "..");

// Les infos du déploiement écrites par scripts/deploy.js.
const deployment = JSON.parse(readFileSync(join(ROOT, "deployment.json"), "utf8"));

const PORT = Number(process.env.PORT ?? 3001);
const POLL_INTERVAL_MS = 5_000; // ~ la durée d'un ledger

// Une base PAR contrat : si on redéploie, l'indexeur repart de zéro
// proprement au lieu de mélanger deux contrats.
const db = openDatabase(join(import.meta.dirname, "..", "data", `${deployment.contractId}.sqlite`));

const poller = startPoller({
  db,
  rpcUrl: deployment.rpcUrl,
  contractId: deployment.contractId,
  deployLedger: deployment.deployLedger,
  intervalMs: POLL_INTERVAL_MS,
});

createApi(db, poller, deployment.contractId).listen(PORT, () => {
  console.log(`🚀 Indexeur de ${deployment.contractId}`);
  console.log(`   API sur http://localhost:${PORT}  (/health, /history/:address, /leaderboard)`);
});
