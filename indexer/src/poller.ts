// =============================================================================
// poller.ts — Lit les événements du contrat via le RPC Stellar (`getEvents`)
// et les range dans SQLite.
//
// "Polling" = on demande régulièrement au RPC : "quoi de neuf depuis la
// dernière fois ?". Le RPC renvoie un `cursor` (marque-page) qu'on garde en
// base : au redémarrage, on reprend EXACTEMENT là où on s'était arrêté.
// =============================================================================

import { rpc, scValToNative } from "@stellar/stellar-sdk";
import type { Database, IndexedEvent } from "./db.ts";

// Les enums Rust `Move` et `Outcome` arrivent comme des nombres (repr u32).
// On les traduit en texte lisible. L'index du tableau = la valeur Rust.
const MOVES = ["Rock", "Paper", "Scissors"];
const OUTCOMES = ["Win", "Tie", "Loss"];

/** Nombre max d'événements par requête (le RPC accepte jusqu'à 10 000). */
const PAGE_SIZE = 200;

export type PollerState = {
  lastPollAt: string | null;
  latestLedger: number | null;
  lastError: string | null;
};

/**
 * Transforme un événement brut du RPC en ligne de notre base.
 * Structure (définie par #[contractevent] dans events.rs) :
 *   topic[0] = nom de l'événement (Symbol), topic[1] = joueur (Address)
 *   value    = Map { champ: valeur }
 */
function decodeEvent(event: rpc.Api.EventResponse): IndexedEvent {
  // scValToNative convertit un ScVal (format binaire Soroban) en valeur JS :
  // Symbol → string, Address → "G...", i128 → bigint, u32 → number, Map → objet.
  const type = scValToNative(event.topic[0]) as string;
  const player = scValToNative(event.topic[1]) as string;
  const data = scValToNative(event.value) as Record<string, any>;

  // Enrichissement : noms lisibles pour les coups et le résultat.
  if (type === "round_played") {
    data.player_move = MOVES[data.player_move];
    data.bank_move = MOVES[data.bank_move];
    data.outcome = OUTCOMES[data.outcome];
  }

  // Colonnes "à plat" utilisées pour trier et filtrer en SQL.
  let amount: bigint | null = null;
  let multiplier: number | null = null;
  if (type === "round_played") {
    amount = data.pot;
    multiplier = 2 ** data.wins;
  } else if (type === "cashed_out") {
    amount = data.amount;
    multiplier = data.multiplier;
  } else if (type === "game_lost") {
    amount = data.lost_pot;
    multiplier = 2 ** data.wins;
  }

  return {
    id: event.id,
    type,
    player,
    ledger: event.ledger,
    closedAt: event.ledgerClosedAt,
    txHash: event.txHash,
    outcome: type === "round_played" ? data.outcome : null,
    amount,
    multiplier,
    data: { player, ...data },
  };
}

/**
 * Démarre la boucle de polling. Renvoie un objet d'état lu par GET /health.
 */
export function startPoller(options: {
  db: Database;
  rpcUrl: string;
  contractId: string;
  deployLedger: number;
  intervalMs: number;
}): PollerState {
  const { db, rpcUrl, contractId, deployLedger, intervalMs } = options;
  const server = new rpc.Server(rpcUrl);
  const state: PollerState = { lastPollAt: null, latestLedger: null, lastError: null };

  // On ne veut que les événements de NOTRE contrat.
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [contractId] }];

  async function pollOnce() {
    // Boucle : tant qu'une page est pleine, il reste des événements à lire
    // (rattrapage après une longue coupure).
    while (true) {
      const cursor = db.getMeta("cursor");
      let request: rpc.Server.GetEventsRequest;

      if (cursor) {
        // Cas normal : on reprend au marque-page.
        request = { cursor, filters, limit: PAGE_SIZE };
      } else {
        // Premier démarrage : on part du ledger du déploiement...
        // ...sauf s'il est plus vieux que la mémoire du RPC (~7 jours sur le
        // testnet) : le RPC refuserait. On part alors du plus vieux ledger
        // disponible, et on prévient que des événements sont perdus.
        const health = await server.getHealth();
        let startLedger = deployLedger;
        if (startLedger < health.oldestLedger) {
          console.warn(`⚠️  Ledger ${deployLedger} hors de la rétention du RPC ; départ au ledger ${health.oldestLedger}.`);
          startLedger = health.oldestLedger;
        }
        request = { startLedger, filters, limit: PAGE_SIZE };
      }

      const response = await server.getEvents(request);
      const events = response.events.map(decodeEvent);
      // Événements + nouveau cursor enregistrés ensemble (transaction SQL).
      db.saveBatch(events, response.cursor);

      if (events.length > 0) {
        console.log(`📥 ${events.length} événement(s) indexé(s) (ledger ${events[events.length - 1].ledger})`);
      }
      state.latestLedger = response.latestLedger;
      if (events.length < PAGE_SIZE) break;
    }
  }

  // `setTimeout` récursif plutôt que `setInterval` : le tour suivant ne
  // démarre qu'une fois le précédent terminé (jamais deux polls en parallèle).
  async function loop() {
    try {
      await pollOnce();
      state.lastPollAt = new Date().toISOString();
      state.lastError = null;
    } catch (error) {
      // Une erreur réseau ne doit pas tuer l'indexeur : on la note et on réessaie.
      state.lastError = String(error);
      console.error("❌ Erreur de polling :", error);
    }
    setTimeout(loop, intervalMs);
  }

  loop();
  return state;
}
