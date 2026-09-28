# 🎰 Double ou Rien

Pierre-feuille-ciseaux contre une **banque qui est un smart contract** sur Stellar (testnet).

- Tu choisis ta mise et ton coup.
- Le contrat tire le coup de la banque **au hasard**.
- **Gagné** → la banque te paie le double. **Perdu** → elle garde ta mise. **Égalité** → remboursé.

## Lancer le projet (PowerShell, à la racine)

```bash
cargo test
```
Lance les 5 tests du contrat (gagné, perdu, égalité, banque trop pauvre, mise invalide).

```bash
npm run deploy
```
Compile, déploie le contrat avec le compte `alice`, met 100 XLM dans la banque et génère
le client TypeScript (`/bindings`). À faire une fois, ou après chaque modification du contrat.

```bash
npm run play
```
Joue dans le terminal : mise, coup, résultat, lien de la transaction, solde et bilan.

> Prérequis : Rust, Stellar CLI, Node.js, et un compte CLI `alice` financé
> (`stellar keys generate alice --network testnet --fund`).
> Si `cargo` n'est pas reconnu :
> `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`

## Documentation

1. [Comprendre Stellar](docs/01-comprendre-stellar.md) : les notions de base
2. [Le contrat](docs/02-le-contrat.md) : le code expliqué bloc par bloc
3. [Les scripts](docs/03-les-scripts.md) : déployer, jouer, vérifier sur stellar.expert
4. [**Guide front**](docs/04-guide-front.md) : brancher l'interface avec Freighter

## Les fichiers

```
contracts/double-ou-rien/src/lib.rs    le contrat (≈ 80 lignes utiles)
contracts/double-ou-rien/src/test.rs   les tests
scripts/deploy.js                      déploiement + génération du client TypeScript
scripts/play.js                        la partie dans le terminal (exemple pour le front)
scripts/lib/stellar-cli.js             lance la commande `stellar` depuis Node
deployment.json                        adresse du contrat déployé (généré)
bindings/                              client TypeScript généré (généré)
```

## Comment ça marche

```
 Joueur (play.js ou front)                 Blockchain Stellar (testnet)
 ─────────────────────────                 ───────────────────────────────────
 choisit mise + coup
 client.play(...) ───── transaction ─────▶ Contrat "Double ou Rien" = la banque
   signée par le joueur                      1. vérifie la signature du joueur
                                             2. mise : joueur → banque
                                             3. tire le coup de la banque (hasard)
                                             4. paie : banque → joueur (2×, 1× ou 0)
 affiche le résultat ◀──── résultat ─────── { bank_move, outcome, payout }
```

**Le contrat en une fonction** : `play(player, player_move, bet) -> Round`
- `player.require_auth()` : le joueur doit avoir **signé**, sinon personne ne peut miser
  l'argent d'un autre.
- Erreur `InvalidBet` (#1) si la mise est ≤ 0, `BankTooPoor` (#2) si la banque ne peut pas payer.
- Le hasard vient de `env.prng()`, le générateur fourni par le réseau.
- Une erreur **annule toute la transaction** : rien n'est transféré.

**Côté joueur (`play.js`)**, un appel se fait en 3 temps :
1. `await client.play(...)` **simule** la transaction (calcul des frais, détection des erreurs, gratuit) ;
2. `await tx.signAndSend()` **signe**, envoie et attend la confirmation (~5 s) ;
3. `sent.result` contient le **vrai** résultat. Celui de la simulation ne compte pas : le
   hasard y est différent.

## Les notions à connaître

| Notion | En une phrase |
|---|---|
| **Testnet** | Le réseau de test de Stellar : les XLM n'y valent rien. |
| **XLM / stroop** | La monnaie de Stellar ; 1 XLM = 10 000 000 stroops (les contrats n'utilisent que des entiers). |
| **Compte** | Une paire de clés : l'adresse publique `G...` et la clé secrète `S...` qui signe (à ne jamais partager). |
| **Smart contract** | Un programme stocké sur la blockchain (adresse `C...`), que personne ne peut modifier, et qui peut détenir de l'argent. |
| **Soroban / WASM** | Les contrats Stellar s'écrivent en Rust et sont compilés en WebAssembly. |
| **SAC** | Sur Soroban, le XLM lui-même est un contrat (`transfer`, `balance`). |
| **Transaction** | Une demande signée envoyée au réseau ; elle réussit entièrement ou pas du tout. |
| **Frais** | Chaque transaction coûte une fraction de centime. |
| **TTL / loyer** | Un contrat stocké se paie pour une durée limitée. `deploy.js` le prolonge de 30 jours. |
| **Bindings** | Client TypeScript généré automatiquement à partir du contrat : `client.play(...)`. |
| **Freighter** | Le portefeuille navigateur qui signera à la place de la clé locale dans le front. |

**Rust dans le contrat** : `enum` (un choix parmi plusieurs), `struct` (un groupe de
valeurs), `match` (tester tous les cas), `Result` (`Ok` ou `Err`, pas d'exceptions en Rust),
`&` (prêter une valeur sans la donner), `#[contract...]` (macros du SDK qui génèrent le code
technique).

## Pour le front

1. Récupérer le dossier `bindings/`, puis `npm install ../chemin/bindings @stellar/freighter-api`.
2. Reprendre `scripts/play.js`. La seule différence : au lieu de `basicNodeSigner(keypair)`,
   signer avec Freighter :
```ts
import { requestAccess, signTransaction } from "@stellar/freighter-api";
const { address } = await requestAccess();
const client = new Client({
  contractId, rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  publicKey: address,
  signTransaction: (xdr) => signTransaction(xdr, { networkPassphrase: "Test SDF Network ; September 2015", address }),
});
```

## Limites (à dire au jury)

- **Le hasard n'est pas sûr** : `env.prng()` peut être manipulé. Par exemple, un contrat
  attaquant qui appelle le nôtre peut annuler sa transaction quand il perd, et ne garder
  que ses victoires. C'est acceptable pour une démo ; en production, on utiliserait un
  **commit-reveal** (chacun publie le hash de son choix, puis le révèle) ou un oracle de hasard.
- **Pas d'avantage maison** : le jeu est équitable (1/3 gagné, 1/3 égalité, 1/3 perdu),
  donc la banque ne gagne rien en moyenne.
- **Pas de retrait** : les XLM de la banque restent dans le contrat, ce qui est sans
  importance sur le testnet.

## Problèmes rencontrés pendant le projet

- **`link.exe` introuvable** au `cargo test` sous Windows : ce dossier utilise la toolchain
  Rust GNU (`rustup override set stable-x86_64-pc-windows-gnu`).
- **`os error 32` pendant `npm run deploy`** : un fichier de `bindings/` est ouvert ailleurs
  (terminal dans ce dossier, OneDrive). Il faut fermer ou mettre en pause, puis relancer.
- **Premier joueur qui payait ~2 XLM de frais** : le contrat prolongeait sa propre durée de vie
  aux frais du joueur. On a déplacé la prolongation dans `deploy.js`.
- **Transactions qui échouaient au hasard** (dans une ancienne version) : la simulation et
  la vraie exécution ne tirent pas le même hasard. Si les issues n'ont pas le même coût, la
  transaction peut dépasser ses limites. D'où la règle : **chaque issue fait les mêmes
  opérations** (on transfère toujours, même 0 XLM).
