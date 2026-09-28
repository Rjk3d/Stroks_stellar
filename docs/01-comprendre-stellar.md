# 1. Comprendre Stellar (l'essentiel)

## La blockchain Stellar
Un **registre public** de comptes et de soldes, copié sur des centaines de serveurs. Personne
ne peut le modifier seul. Un nouveau « bloc », appelé **ledger**, est validé toutes les
**~5 secondes**.

## Testnet
Le réseau de **test** : les XLM n'y valent rien. On en obtient gratuitement avec
**Friendbot** (`stellar keys generate player1 --network testnet --fund`).

## Comptes et clés
Un compte = une paire de clés :
- **adresse publique** `G...` : on peut la partager, c'est ton « RIB » ;
- **clé secrète** `S...` : sert à **signer**. Ne jamais la partager.

Dans le projet, `alice` déploie le contrat et `player1` joue. Leurs clés sont gardées par la
CLI Stellar sur ton PC, pas dans le projet.

## XLM et stroops
**1 XLM = 10 000 000 stroops.** Les contrats ne manipulent que des **entiers**, jamais de
virgule. C'est pour ça que le code utilise `10_000_000` pour 1 XLM.

## Transaction et frais
Une **transaction** est une demande **signée** envoyée au réseau. Elle réussit **entièrement
ou pas du tout** : si une étape échoue, rien n'est modifié.
Chaque transaction coûte des **frais** minuscules (~0,0015 XLM pour une partie).

## Smart contract
Un **programme stocké sur la blockchain**, qui a sa propre adresse `C...`. Une fois déployé,
personne ne peut changer son code. Il peut **posséder de l'argent** : notre contrat **est**
la banque.

- On l'écrit en **Rust** avec **Soroban** (la plateforme de contrats de Stellar).
- Il est compilé en **WASM** (WebAssembly), un format que tous les serveurs exécutent à l'identique.
- Même le XLM est un contrat, le **SAC** (Stellar Asset Contract), avec `transfer` et `balance`.

## Durée de vie (TTL)
Stocker un contrat se paie comme un **loyer**, pour une durée limitée. `deploy.js` le prolonge
de **30 jours**. Au-delà, le contrat est archivé (restaurable, rien n'est perdu).

## Le RPC
Le point d'accès au réseau : `https://soroban-testnet.stellar.org`. Les scripts et le front
passent par lui pour **simuler**, **envoyer** et **suivre** les transactions.

## L'explorateur
**stellar.expert** (réseau testnet) montre tout publiquement : soldes, transactions,
transferts, frais. C'est là qu'on vérifie que tout s'est bien passé.
