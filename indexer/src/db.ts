// =============================================================================
// db.ts — Stockage local des événements dans SQLite.
//
// Pourquoi SQLite ? C'est une base de données SQL complète contenue dans UN
// fichier : aucun serveur à installer. Et Node 24 l'intègre (`node:sqlite`),
// donc zéro dépendance et aucune compilation native (souvent pénible sous Windows).
// Pourquoi pas un simple fichier JSON ? Pour les requêtes : "les 10 plus gros
// gains", "l'historique d'une adresse"... SQL le fait en une ligne, avec des index.
// =============================================================================

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Un événement du contrat, déjà décodé, prêt à être stocké. */
export type IndexedEvent = {
  id: string; // identifiant unique fourni par le RPC
  type: string; // "round_played" | "cashed_out" | "game_lost"
  player: string; // adresse G... du joueur
  ledger: number;
  closedAt: string; // date de fermeture du ledger (ISO)
  txHash: string;
  outcome: string | null; // "Win" | "Tie" | "Loss" (round_played seulement)
  amount: bigint | null; // montant principal en stroops (pot / encaissé / perdu)
  multiplier: number | null;
  data: Record<string, unknown>; // tout le contenu de l'événement
};

// JSON.stringify ne sait pas écrire les BigInt : on les convertit en texte.
const toJson = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));

export function openDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);

  // Création des tables au premier démarrage (IF NOT EXISTS = sans effet ensuite).
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id         TEXT PRIMARY KEY,  -- clé unique : un événement ne peut pas être inséré 2 fois
      type       TEXT NOT NULL,
      player     TEXT NOT NULL,
      ledger     INTEGER NOT NULL,
      closed_at  TEXT NOT NULL,
      tx_hash    TEXT NOT NULL,
      outcome    TEXT,
      amount     INTEGER,           -- stroops (entier 64 bits : largement suffisant)
      multiplier INTEGER,
      data       TEXT NOT NULL      -- l'événement complet en JSON
    );
    -- Index : accélère la recherche par joueur (GET /history/:address).
    CREATE INDEX IF NOT EXISTS idx_events_player ON events(player, ledger);
    -- Petite table clé/valeur pour mémoriser où on en est (le "cursor").
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Requêtes "préparées" : compilées une fois, réutilisées. Les `?` sont
  // remplacés par les paramètres de façon sûre (pas d'injection SQL possible).
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO events (id, type, player, ledger, closed_at, tx_hash, outcome, amount, multiplier, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getMetaStmt = db.prepare("SELECT value FROM meta WHERE key = ?");
  const setMetaStmt = db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );

  return {
    /**
     * Enregistre un lot d'événements ET le nouveau cursor dans UNE transaction
     * SQL : soit tout est écrit, soit rien. Si l'indexeur plante au milieu,
     * il repartira de l'ancien cursor sans perdre ni dupliquer d'événement
     * (INSERT OR IGNORE ignore ceux déjà présents).
     */
    saveBatch(events: IndexedEvent[], cursor: string) {
      db.exec("BEGIN");
      try {
        for (const e of events) {
          insertStmt.run(e.id, e.type, e.player, e.ledger, e.closedAt, e.txHash,
            e.outcome, e.amount, e.multiplier, toJson(e.data));
        }
        setMetaStmt.run("cursor", cursor);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    getMeta(key: string): string | undefined {
      const row = getMetaStmt.get(key) as { value: string } | undefined;
      return row?.value;
    },

    setMeta(key: string, value: string) {
      setMetaStmt.run(key, value);
    },

    countEvents(): number {
      const row = db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };
      return row.n;
    },

    /** Historique d'un joueur, du plus récent au plus ancien. */
    history(player: string, limit: number) {
      const rows = db
        .prepare(`SELECT type, ledger, closed_at, tx_hash, data FROM events
                  WHERE player = ? ORDER BY ledger DESC, id DESC LIMIT ?`)
        .all(player, limit) as { type: string; ledger: number; closed_at: string; tx_hash: string; data: string }[];
      // On "déplie" le JSON stocké pour renvoyer un objet plat au front.
      return rows.map((r) => ({
        type: r.type,
        ledger: r.ledger,
        closedAt: r.closed_at,
        txHash: r.tx_hash,
        ...JSON.parse(r.data),
      }));
    },

    /** Plus gros encaissements. Montants renvoyés en TEXTE (stroops), comme
     *  partout dans l'API : un i128 peut dépasser les entiers sûrs de JavaScript. */
    biggestWins(limit: number) {
      return db
        .prepare(`SELECT player, CAST(amount AS TEXT) AS amount, multiplier, closed_at AS closedAt, tx_hash AS txHash
                  FROM events WHERE type = 'cashed_out' ORDER BY amount DESC LIMIT ?`)
        .all(limit);
    },

    /** Plus gros multiplicateurs encaissés (à égalité : le plus gros montant d'abord). */
    biggestMultipliers(limit: number) {
      return db
        .prepare(`SELECT player, multiplier, CAST(amount AS TEXT) AS amount, closed_at AS closedAt, tx_hash AS txHash
                  FROM events WHERE type = 'cashed_out' ORDER BY multiplier DESC, amount DESC LIMIT ?`)
        .all(limit);
    },
  };
}

// `ReturnType<typeof openDatabase>` : le type de l'objet renvoyé par openDatabase,
// déduit automatiquement par TypeScript (pas besoin de l'écrire à la main).
export type Database = ReturnType<typeof openDatabase>;
