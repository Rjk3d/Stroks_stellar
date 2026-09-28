// =============================================================================
// scripts/lib/resource-margin.js — Ajoute une marge aux ressources estimées
// par la simulation. INDISPENSABLE pour start et play. Le front doit copier
// cette fonction (voir docs/05-integration-front.md).
//
// LE PROBLÈME
// Avant d'envoyer une transaction Soroban, on la SIMULE : le RPC l'exécute
// "à blanc" et mesure ce qu'elle consomme (instructions CPU, octets lus et
// écrits, taille des événements). Ces mesures deviennent des LIMITES gravées
// dans la transaction signée.
// Or dans notre jeu, le coup de la banque tiré pendant la simulation n'est pas
// celui tiré dans le vrai ledger (la graine du hasard diffère). La simulation
// peut donc mesurer une égalité (1 événement) alors que la vraie exécution est
// une défaite (2 événements, plus de calcul) → la limite est dépassée et la
// transaction échoue : `invokeHostFunctionResourceLimitExceeded`.
//
// LA SOLUTION
// Relever les limites. La part "remboursable" des frais non utilisée est
// rendue au joueur : la marge ne coûte presque rien.
// =============================================================================

import { rpc } from "double-ou-rien-client";

/**
 * Modifie une AssembledTransaction fraîchement simulée (le retour de
 * `await client.start(...)`) pour augmenter ses limites de ressources.
 *
 * ⚠️ À appeler AVANT de lire `tx.result` : le SDK met les données de
 * simulation en cache au premier accès, et c'est ce cache qu'il utilise
 * ensuite pour signer.
 */
export function addResourceMargin(tx) {
  // `tx.simulation` = la réponse brute du RPC. Si la simulation a échoué
  // (erreur du contrat), rien à faire : l'appelant verra l'erreur via tx.result.
  if (!rpc.Api.isSimulationSuccess(tx.simulation)) return tx;

  // `transactionData` est un SorobanDataBuilder : un objet modifiable qui
  // contient les limites de ressources et les frais de ressources.
  const builder = tx.simulation.transactionData;
  const data = builder.build(); // lecture des valeurs actuelles (XDR)
  const resources = data.resources();

  builder
    .setResources(
      Math.ceil(resources.instructions() * 1.3) + 200_000, // CPU : +30 % + un fixe
      resources.diskReadBytes(), // lectures : identiques quelle que soit l'issue
      resources.writeBytes() + 500, // écritures : petite marge
    )
    // Frais de ressources x2 : couvrent le CPU en plus et les événements plus
    // gros. `toBigInt()` : les montants XDR 64 bits se manipulent en BigInt.
    .setResourceFee(data.resourceFee().toBigInt() * 2n);

  return tx;
}
