# 3. Les scripts (déployer et jouer)

## `npm run deploy` → `scripts/deploy.js`
Ce script fait tout en une commande, dans cet ordre :
1. `stellar contract build` : compile le Rust en `.wasm` ;
2. `stellar contract id asset --asset native` : récupère l'adresse du contrat XLM ;
3. `stellar contract deploy ... -- --token <XLM>` : déploie le contrat avec `alice` et
   appelle le constructeur ;
4. `stellar contract invoke ... transfer` : alice envoie **100 XLM** à la banque ;
5. `stellar contract extend` : paie la durée de vie du contrat (30 jours) ;
6. écrit l'adresse du contrat dans `deployment.json` ;
7. `stellar contract bindings typescript` : **génère le client TypeScript** dans `/bindings`,
   puis le compile et l'installe.

Après un nouveau déploiement, l'adresse du contrat change : `deployment.json` et `bindings/`
sont mis à jour automatiquement.

`scripts/lib/stellar-cli.js` sert juste à lancer la commande `stellar` depuis Node.

## Les « bindings » (`/bindings`)
C'est un petit paquet npm **généré automatiquement** à partir du contrat. Il contient :
- `Client` : un objet avec une méthode par fonction du contrat (`client.play(...)`) ;
- les types `Move`, `Outcome`, `Round` et les erreurs ;
- l'adresse du contrat et le réseau ;
- tout le SDK Stellar (`Keypair`, `rpc`...).

On n'écrit donc aucun code d'encodage à la main.

## `npm run play` → `scripts/play.js`
1. Crée le compte `player1` s'il n'existe pas (financé par Friendbot).
2. Crée le `Client` avec l'adresse du contrat et **qui signe** (ici la clé de `player1`).
3. Affiche ton solde, demande ta mise et ton coup.
4. Joue la partie en 3 temps :
```js
const tx = await client.play({ player, player_move: myMove, bet }); // a) SIMULATION
if (tx.result.isErr()) { ... }                                    //    erreur ? on s'arrête (gratuit)
const sent = await tx.signAndSend();                              // b) signature + envoi + attente (~5 s)
const round = sent.result.unwrap();                               // c) le VRAI résultat
```
5. Affiche le coup de la banque, le résultat, le lien de la transaction et le nouveau solde.
6. Propose de rejouer. À la fin, affiche le **bilan** (frais compris).

⚠️ Le résultat de la **simulation** n'est pas le vrai, car le hasard est différent : on lit
toujours `sent.result`.

## Vérifier sur stellar.expert (testnet)
- **Transaction** : lien 🔗 affiché après chaque partie (signataire, appel `play`, les deux
  transferts, frais).
- **Banque** : `https://stellar.expert/explorer/testnet/contract/<contractId de deployment.json>`
- **Joueur** : `https://stellar.expert/explorer/testnet/account/<stellar keys address player1>`

Après une victoire avec 1 XLM de mise : la banque a −1 XLM, le joueur +1 XLM (moins ~0,0015
de frais).

## Problèmes connus
| Problème | Solution |
|---|---|
| `cargo`/`stellar` non reconnu | `$env:Path = "$env:USERPROFILE\.cargo\bin;C:\Program Files (x86)\Stellar CLI;$env:Path"` |
| `link.exe` introuvable | `rustup override set stable-x86_64-pc-windows-gnu` (déjà fait dans ce dossier) |
| `os error 32` pendant deploy | un fichier de `bindings/` est ouvert ailleurs (terminal, OneDrive) : fermer et relancer |
| `BankTooPoor` | la banque est vide : envoyer des XLM au contrat ou redéployer |
