# 2. Le contrat, bloc par bloc

Fichier : `contracts/double-ou-rien/src/lib.rs`

## Le principe
```
Joueur ── mise ──▶ Banque (le contrat)
                   tire un coup au hasard
Joueur ◀── paie ── Gagné : 2 × mise | Égalité : la mise | Perdu : 0
```

## 1. `#![no_std]`
Le contrat tourne dans une machine virtuelle minimale (pas de fichiers, pas d'écran). On
désactive donc la bibliothèque standard de Rust ; le SDK Soroban fournit ce qu'il faut.

## 2. Les types

```rust
#[contracttype]
#[repr(u32)]
pub enum Move { Rock = 0, Paper = 1, Scissors = 2 }
```
- `enum` : une valeur **parmi plusieurs choix** ;
- `#[contracttype]` : permet d'utiliser ce type comme paramètre du contrat. Côté
  TypeScript, il devient `Move.Rock`, etc. ;
- `#[repr(u32)]` : stocké comme un simple nombre (0, 1, 2).

`Outcome { Win, Tie, Loss }` suit le même principe : c'est le résultat vu par le joueur.

```rust
pub struct Round { pub bank_move: Move, pub outcome: Outcome, pub payout: i128 }
```
- `struct` : un **groupe de valeurs**. C'est ce que `play` renvoie : le coup de la banque,
  le résultat et le montant rendu ;
- `i128` : le type des montants (en stroops).

## 3. Les erreurs
```rust
#[contracterror]
pub enum Error { InvalidBet = 1, BankTooPoor = 2 }
```
| Code | Nom | Quand |
|---|---|---|
| 1 | `InvalidBet` | mise ≤ 0 |
| 2 | `BankTooPoor` | la banque n'a pas de quoi payer une victoire |

Quand le contrat renvoie une erreur, **toute la transaction est annulée**.

## 4. Le stockage
```rust
pub enum DataKey { Token }
```
Le contrat ne retient **qu'une chose** : l'adresse du contrat XLM. Elle est enregistrée au
déploiement par le constructeur :
```rust
pub fn __constructor(env: Env, token: Address) {
    env.storage().instance().set(&DataKey::Token, &token);
}
```
`__constructor` est exécuté **une seule fois**, automatiquement, pendant `npm run deploy`.
`env` (l'environnement) est la porte d'accès à la blockchain : stockage, hasard, adresse du contrat.

## 5. La fonction `play`, étape par étape

```rust
pub fn play(env: Env, player: Address, player_move: Move, bet: i128) -> Result<Round, Error>
```
`Result<Round, Error>` : la fonction renvoie **soit** `Ok(round)`, **soit** `Err(erreur)`.
Rust n'a pas d'exceptions.

**a) Signature obligatoire**
```rust
player.require_auth();
```
Le joueur doit avoir **signé** la transaction. Sans cette ligne, n'importe qui pourrait
miser l'argent d'un autre. C'est la ligne de sécurité la plus importante.

**b) Vérifications**
```rust
if bet <= 0 { return Err(Error::InvalidBet); }
if xlm.balance(&bank) < bet { return Err(Error::BankTooPoor); }
```
Si le joueur gagne, la banque rend 2 × la mise : la mise du joueur plus une mise de la
banque. Sa caisse doit donc contenir au moins `bet`.

**c) La mise part à la banque**
```rust
xlm.transfer(&player, &bank, &bet);
```
Le `&` **prête** une valeur à la fonction sans la lui donner (notion d'« emprunt » en Rust).

**d) Le hasard**
```rust
let bank_move = match env.prng().gen_range::<u64>(0..=2) {
    0 => Move::Rock, 1 => Move::Paper, _ => Move::Scissors,
};
```
`env.prng()` est le générateur aléatoire fourni par le réseau. `match` teste chaque cas
(`_` = tous les autres).

**e) Qui gagne ?**
```rust
let outcome = if player_move == bank_move { Outcome::Tie }
    else if matches!((player_move, bank_move),
        (Move::Rock, Move::Scissors) | (Move::Paper, Move::Rock) | (Move::Scissors, Move::Paper))
    { Outcome::Win }
    else { Outcome::Loss };
```

**f) Le paiement**
```rust
let payout = match outcome { Outcome::Win => bet * 2, Outcome::Tie => bet, Outcome::Loss => 0 };
xlm.transfer(&bank, &player, &payout);
```
On transfère **toujours**, même 0 XLM. Pourquoi ? Avant l'envoi, le réseau **simule** la
transaction pour calculer ses frais, et le hasard de la simulation n'est pas le même que
celui de la vraie exécution. Si chaque issue fait les mêmes opérations, elles coûtent toutes
pareil, et la transaction ne peut pas échouer par manque de frais.

**g) Le résultat**
```rust
Ok(Round { bank_move, outcome, payout })
```

## 6. Les tests (`test.rs`)
`cargo test` lance 5 tests sur une **fausse blockchain en mémoire** : gagné, perdu, égalité,
banque trop pauvre, mise invalide.
Pour tester un résultat précis, on **fixe la graine du hasard**
(`env.host().set_base_prng_seed(...)`), on regarde le coup que la banque va jouer, puis on
choisit le coup du joueur en conséquence.

## 7. Les maths
Chaque issue a une chance sur 3. Le jeu est **équitable** : en moyenne, ni le joueur ni la
banque ne gagne.

## 8. La limite à connaître
`env.prng()` n'est **pas un hasard sûr**. Un contrat attaquant peut appeler le nôtre et
**annuler sa transaction quand il perd**, et ne garder que ses victoires. C'est acceptable
pour une démo sur le testnet. La vraie solution est le **commit-reveal** : chacun publie le
hash de son choix, puis le révèle.
