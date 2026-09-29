# Fiche d’intégration — front / back

État du 29 septembre 2026. Le front s’adapte au contrat de `contracts/double-ou-rien/src/lib.rs` et aux bindings TypeScript du dépôt, base `911b3c9`. Les fonctions ci-dessous existent déjà ; aucune nouvelle route HTTP n’est requise.

## Règles effectivement intégrées

`play(player: Address, player_move: Move, bet: i128) -> Result<Round, Error>` est une manche autonome. `player_move` : pierre = 0, feuille = 1, ciseaux = 2. `Round` : `bank_move`, `outcome` (victoire = 0, égalité = 1, défaite = 2), `payout` en stroops.

XLM Testnet : 7 décimales, soit 10 000 000 stroops par XLM. Les montants sont des `bigint` dans le front et des chaînes décimales dans le stockage local, jamais des nombres flottants pour les calculs.

Une victoire verse automatiquement 2 × la mise, une égalité rembourse la mise, une défaite ne verse rien. Les frais réseau sont distincts. Exemple hors frais, avec 100 XLM au départ : miser 10 et gagner donne un solde de 110 ; remiser les 20 reçus et gagner donne 130 ; remiser les 40 reçus et perdre donne 90. Une égalité conserve le solde hors frais et propose une nouvelle manche signée.

Le contrat ne conserve ni partie, ni gains à retirer. Le front affiche donc **Retour au menu** et **Remiser**, sans inventer une fonction d’encaissement. Le résultat vient exclusivement de la transaction confirmée ; le rouleau ne choisit pas le bot. Le `env.prng()` du contrat reste un mécanisme de démonstration, sans promesse d’équité vérifiable.

## Échanges

| Besoin                | Échange utilisé                                                      | Données / réponse                                                                          | Erreurs et comportement                                                                                                                 |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Connexion             | Freighter `isConnected`, `requestAccess`, `getNetwork`, `getAddress` | Adresse publique et passphrase Testnet                                                     | Extension absente, accès refusé, compte déconnecté/changé, mauvais réseau : bloquer la mise avec un message                             |
| Solde                 | RPC `getAccountEntry`, `getLatestLedger`, `getLedgers`               | Solde total, réserves, engagements de vente ; calcul du disponible                         | Compte non financé ou RPC indisponible : solde à actualiser, aucune mise tant que la lecture échoue                                     |
| Préparer une manche   | Client généré `play` puis simulation avec `restore: false`           | Joueur, choix, mise ; transaction préparée et plafond de frais                             | `InvalidBet` (#1), `BankTooPoor` (#2), solde/frais insuffisants, contrat expiré ; aucun résultat de simulation présenté comme définitif |
| Signer                | Freighter `signTransaction` via client généré                        | XDR préparé, passphrase, adresse attendue → XDR signé                                      | Refus/changement de compte/annulation : aucun envoi ; hash signé vérifié contre la transaction préparée                                 |
| Envoyer               | RPC `sendTransaction`                                                | Transaction signée → statut de soumission                                                  | Hash et contexte enregistrés **avant** envoi ; exception réseau : conserver la référence sans renvoyer                                  |
| Confirmer / reprendre | RPC `getTransaction(hash)`                                           | `SUCCESS` + `returnValue` décodé avec les bindings, frais réels, ou `FAILED` / `NOT_FOUND` | Un statut envoyé ou introuvable n’est pas un paiement. Suivi conservé jusqu’à confirmation ou expiration prouvable                      |
| Poursuivre            | Nouveau `play` après choix                                           | Versement précédent proposé comme mise ; nouvelle signature                                | Même validation que la première manche ; pas de mise automatiquement renvoyée                                                           |
| Encaisser             | Aucun appel supplémentaire                                           | Versement déjà effectué par `play` confirmé                                                | Une opération en attente reste suivie au menu ; pas de bouton de retrait artificiel                                                     |

La référence locale contient le réseau, le contrat, le hash, l’adresse publique, le choix, la mise, les dates de création et d’expiration. Elle ne contient aucune clé privée ni phrase de récupération. Un verrou immédiat et Web Locks empêchent les doubles envois depuis la même origine. Une reprise vérifie seulement l’état de la transaction.

## Configuration du dépôt

- Réseau : `Test SDF Network ; September 2015`.
- RPC : `https://soroban-testnet.stellar.org`.
- Contrat : `CAHM2T2F2G2ZCWXLMNKSPPFFDGGDJMLYDMPMP4HN7DSLDMQ67Q3TE5PZ`.
- Actif natif : XLM Testnet, token défini dans `deployment.json`.
- Source de configuration du front : `networks.testnet` dans `bindings/`.

## À vérifier ensemble avant le pitch

1. Le déploiement et les bindings correspondent toujours au contrat utilisé par l’équipe. Après redéploiement, reconstruire bindings et front.
2. Le compte de démonstration et la banque sont financés ; le contrat et le token restent accessibles. `node frontend/scripts/check-testnet.mjs` fournit une vérification en lecture seule.
3. Sur le PC de présentation, signer une petite manche avec Freighter et comparer le résultat, le versement et les frais à l’explorateur Testnet.
4. Tester un refus de signature et une actualisation après soumission dans ce navigateur. Ne pas effacer les données du site tant que la transaction est suivie.
5. Confirmer l’heure du pitch le mercredi 30 septembre pour réserver la répétition. Le mode démo autonome est prêt si le réseau ou le portefeuille n’est pas disponible.

La restauration du contrat expiré, les changements de règles, l’approvisionnement de la banque et le mécanisme de hasard restent du ressort du développeur back.
