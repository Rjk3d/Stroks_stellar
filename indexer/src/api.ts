// =============================================================================
// api.ts — L'API REST consommée par le front.
//
//   GET /health             → l'indexeur est-il vivant et à jour ?
//   GET /history/:address   → toutes les actions d'un joueur
//   GET /leaderboard        → plus gros gains et plus gros multiplicateurs
//
// Tous les montants sont en STROOPS, sous forme de CHAÎNES ("20000000" = 2 XLM),
// car un i128 peut dépasser les entiers exacts de JavaScript (2^53).
// =============================================================================

import express from "express";
import cors from "cors";
import { StrKey } from "@stellar/stellar-sdk";
import type { Database } from "./db.ts";
import type { PollerState } from "./poller.ts";

/** Lit ?limit=N en le bornant entre 1 et max (valeur par défaut sinon). */
function readLimit(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

export function createApi(db: Database, poller: PollerState, contractId: string) {
  const app = express();

  // CORS : par sécurité, un navigateur interdit à une page (ex. le front sur
  // localhost:5173) d'appeler un autre "origine" (localhost:3001) sauf si ce
  // serveur l'autorise. `cors()` sans option autorise toutes les origines :
  // acceptable ici car l'API est publique et en lecture seule.
  app.use(cors());

  app.get("/health", (_req, res) => {
    res.json({
      status: poller.lastError ? "degraded" : "ok",
      contractId,
      latestLedger: poller.latestLedger,
      lastPollAt: poller.lastPollAt,
      lastError: poller.lastError,
      eventsIndexed: db.countEvents(),
    });
  });

  app.get("/history/:address", (req, res) => {
    const { address } = req.params;
    // Validation de l'entrée : on refuse ce qui n'est pas une adresse G... valide.
    if (!StrKey.isValidEd25519PublicKey(address)) {
      res.status(400).json({ error: "Adresse Stellar invalide (attendu : G...)" });
      return;
    }
    const limit = readLimit(req.query.limit, 50, 500);
    res.json({ address, events: db.history(address, limit) });
  });

  app.get("/leaderboard", (req, res) => {
    const limit = readLimit(req.query.limit, 10, 100);
    res.json({
      biggestWins: db.biggestWins(limit),
      biggestMultipliers: db.biggestMultipliers(limit),
    });
  });

  return app;
}
