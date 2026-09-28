# 02 — Rust pour Soroban (par l'exemple)

> Chaque concept est illustré par un **extrait réel** de
> `contracts/double-ou-rien/src/`. Pas besoin de tout Rust pour écrire un contrat :
> ces ~20 notions suffisent.

---

## 1. `#![no_std]` : pas de bibliothèque standard

```rust
#![no_std]
```
Un contrat tourne dans une machine virtuelle WASM minimaliste : pas de fichiers, pas de
réseau, pas d'affichage. On désactive la bibliothèque standard de Rust. Le SDK fournit
ses propres `Vec`, `Map`, `String` et `Address`, stockés par l'hôte Soroban.
Les **tests** tournent sur le PC et peuvent la réactiver (`extern crate std;` dans `test.rs`).

## 2. Modules et `use`

```rust
mod errors;          // déclare le module = le fichier errors.rs
pub use errors::Error;   // ré-exporte Error (visible de l'extérieur)
use soroban_sdk::{contract, contractimpl, token, Address, Env};
```
`mod` découpe le code en fichiers, `use` importe des noms, et `pub` rend visible à l'extérieur.
`crate::` désigne la racine de **notre** projet (`use crate::types::{Move, Outcome};`).

## 3. Variables : immuables par défaut, `mut` pour modifier

```rust
let config = read_config(&env);                         // ne changera pas
let mut game = Game { bet, pot: bet, wins: 0, rounds: 0 };  // sera modifiée
```
En Rust, une variable est **immuable** sauf si on écrit `mut`. Cela évite des bugs, et le
compilateur refuse toute modification non déclarée.

## 4. Types numériques et conversions

| Type | Utilisé pour | Pourquoi |
|---|---|---|
| `i128` | montants (stroops) | standard des tokens Soroban, ne déborde jamais en pratique |
| `u32` | compteurs, enums | petits entiers positifs |
| `u64` | tirage aléatoire | type attendu par `gen_range` |

```rust
let random: u64 = env.prng().gen_range(0..=2);   // annotation de type
storage.set(&DataKey::Reserved, &0i128);         // suffixe : "0 de type i128"
```
Rust ne convertit **jamais** implicitement entre types numériques (il faut `as` ou
`.into()`). Et avec `overflow-checks = true` (dans `Cargo.toml`), un dépassement fait
échouer la transaction au lieu de « boucler » silencieusement, ce qui est vital pour de l'argent.

## 5. `struct` : regrouper des données

```rust
pub struct Game {
    pub bet: i128,
    pub pot: i128,
    pub wins: u32,
    pub rounds: u32,
}
```
Création : `Game { bet, pot: bet, wins: 0, rounds: 0 }` (`bet` seul = `bet: bet`).
Accès : `game.pot`.

## 6. `enum` : une valeur parmi plusieurs

```rust
#[repr(u32)]
pub enum Move { Rock = 0, Paper = 1, Scissors = 2 }
```
Les variantes d'un enum Rust peuvent **porter des données**, ce que ne permettent pas les
enums d'autres langages :
```rust
pub enum DataKey {
    Admin,               // variante simple
    Game(Address),       // variante qui contient une adresse → une clé par joueur
}
```

## 7. `impl` et méthodes, `self`

```rust
impl Move {
    pub fn beats(self, other: Move) -> bool {
        matches!((self, other), (Move::Rock, Move::Scissors) | (Move::Paper, Move::Rock) | (Move::Scissors, Move::Paper))
    }
}
```
`impl Move` ajoute des fonctions au type. Si la fonction prend `self`, c'est une
**méthode** qu'on appelle avec `player_move.beats(bank_move)`.

## 8. `match` : le « switch » exhaustif

```rust
pub fn from_index(index: u64) -> Move {
    match index {
        0 => Move::Rock,
        1 => Move::Paper,
        _ => Move::Scissors,   // `_` = tous les autres cas
    }
}
```
Le compilateur **exige** que tous les cas soient traités. Un `match` est aussi une
**expression** qui renvoie une valeur :
```rust
let new_reserved = match outcome {
    Outcome::Win => { /* ... */ reserved - pot_before + pot_if_win }
    Outcome::Tie => reserved,
    Outcome::Loss => { /* ... */ reserved - pot_before }
};
```
Un match peut avoir des **gardes** (`if`) :
```rust
match next_multiplier {
    Some(m) if m <= config.max_multiplier => {}
    _ => return Err(Error::MaxMultiplierReached),
}
```

## 9. `Option<T>` : une valeur… ou rien

Rust n'a pas de `null`. Une valeur peut-être absente est une `Option` : `Some(valeur)` ou `None`.
```rust
pub fn get_game(env: Env, player: Address) -> Option<Game>   // None = pas de partie
```
Outils utilisés dans le projet :

| Méthode | Effet | Exemple |
|---|---|---|
| `.is_some()` | vrai si `Some` | `read_game(&env, &player).is_some()` |
| `.unwrap()` | extrait la valeur, **panique** si `None` | `...get(&DataKey::Config).unwrap()` |
| `.unwrap_or_default()` | valeur ou valeur par défaut | `...get(&DataKey::Stats(..)).unwrap_or_default()` |
| `.ok_or(e)` | `Option` vers `Result` (`None` → `Err(e)`) | `read_game(..).ok_or(Error::NoGameInProgress)` |
| `.filter(cond)` | `Some` → `None` si la condition est fausse | `.filter(\|g: &Game\| g.pot > 0)` |

Côté TypeScript, `None` devient `null`.

## 10. `Result<T, E>` et l'opérateur `?`

Rust n'a pas d'exceptions : une erreur est une **valeur de retour**.
```rust
pub fn play(env: Env, player: Address, player_move: Move) -> Result<Outcome, Error> {
    let mut game = read_game(&env, &player).ok_or(Error::NoGameInProgress)?;
    // ...
}
```
Le `?` à la fin signifie : « si c'est `Err`, renvoie immédiatement cette erreur ; sinon
donne-moi la valeur ». Sans lui, il faudrait écrire un `match` complet.
`Ok(())` signifie « succès, sans valeur » (`()` est le type vide).
Pour un contrat Soroban, renvoyer `Err` **annule toute la transaction**, y compris les
transferts déjà faits dans l'appel.

## 11. Ownership, emprunts `&` et `&mut`

C'est LA notion propre à Rust. Chaque valeur a **un seul propriétaire**. Pour la donner à
une fonction sans la céder, on la **prête** avec une référence :

| Syntaxe | Signification | Exemple du projet |
|---|---|---|
| `x` | on **donne** la valeur (le propriétaire change) | `CashedOut { player, ... }` : `player` est donné à l'événement |
| `&x` | on **prête en lecture** | `read_config(&env)`, `transfer(&player, ..., &bet)` |
| `&mut x` | on **prête en écriture** | `play_round(&env, &player, &mut game, player_move)` |

```rust
fn play_round(env: &Env, player: &Address, game: &mut Game, player_move: Move) -> Result<Outcome, Error> {
    game.rounds += 1;   // modifie la partie de l'appelant grâce à &mut
```
Règle vérifiée par le compilateur : soit **plusieurs lecteurs**, soit **un seul écrivain**,
jamais les deux en même temps. Cela élimine toute une famille de bugs à la compilation.

## 12. `.clone()` et `Copy`

```rust
env.storage().persistent().get(&DataKey::Game(player.clone()))
```
`DataKey::Game` doit **posséder** son adresse, mais on n'a qu'une référence `&Address` :
on crée une copie avec `.clone()`.
Les types simples marqués `Copy` (entiers, `Move`, `Outcome`) sont copiés automatiquement,
sans `.clone()`.

## 13. `#[derive(...)]` : du code écrit par le compilateur

```rust
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
```
- `Clone`/`Copy` : duplicable ;
- `Debug` : affichable dans les messages de test ;
- `PartialEq`/`Eq` : comparable avec `==` ;
- `Default` : `Stats::default()` donne tout à zéro.

## 14. Les macros du SDK (`#[...]` et `xxx!`)

Une **macro** génère du code à la compilation. Celles du SDK font l'essentiel du travail :

| Macro | Rôle |
|---|---|
| `#[contract]` | marque la struct qui représente le contrat |
| `#[contractimpl]` | rend chaque `pub fn` appelable de l'extérieur, et génère `DoubleOuRienClient` pour les tests |
| `#[contracttype]` | rend un type stockable et transmissible (conversion en XDR), et générable en TypeScript |
| `#[contracterror]` | transforme un enum en codes d'erreur (`Error(Contract, #3)`) |
| `#[contractevent]` | transforme une struct en événement (`.publish(&env)`) |
| `panic_with_error!(&env, e)` | arrête tout avec notre code d'erreur (utilisé dans le constructeur) |
| `matches!(v, motif)` | vrai si `v` correspond au motif (macro standard de Rust) |

## 15. `Env` : la porte vers la blockchain

```rust
env.storage().instance()         // stockage global du contrat
env.storage().persistent()       // stockage durable, une entrée par clé
env.prng().gen_range(0..=2)      // hasard (voir docs/06-securite.md !)
env.current_contract_address()   // l'adresse C... de NOTRE contrat
```
Chaque fonction publique reçoit `env: Env` en premier paramètre. Les fonctions internes
reçoivent `env: &Env`, car elles l'empruntent.

## 16. `require_auth()` : l'autorisation

```rust
player.require_auth();
```
« Cet appel doit être autorisé par `player` ». Si `player` n'a pas signé, la transaction
échoue. C'est la **ligne de sécurité la plus importante** du contrat : sans elle, n'importe
qui pourrait miser avec l'argent d'un autre. Pour l'admin : `read_admin(&env).require_auth()`.

## 17. Closures `|x| ...`

```rust
.filter(|g: &Game| g.pot > 0)          // lib.rs
let bank_move = s.env.as_contract(&s.contract_id, || { ... });   // test.rs
```
Une closure est une fonction anonyme écrite sur place : `|paramètres| corps`.

## 18. Expressions et point-virgule

En Rust, presque tout est une expression. La **dernière expression sans `;`** d'un bloc
est sa valeur de retour :
```rust
fn doubled_pot(pot: i128) -> i128 {
    pot * 2          // pas de `;` → c'est la valeur renvoyée
}
```

## 19. Constantes

```rust
const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
```
Calculées à la compilation, sans coût à l'exécution. Le `_` dans `17_280` sert juste à
la lisibilité.

## 20. Tests : `#[test]`, `assert_eq!`, `#[should_panic]`

```rust
#[test]
fn test_bet_out_of_bounds() {
    let s = default_setup();
    assert_eq!(s.client.try_start(&s.player, &Move::Rock, &(XLM / 2)), Err(Ok(Error::BetTooLow)));
}
```
- `cargo test` exécute toutes les fonctions `#[test]` ;
- `assert_eq!(a, b)` fait échouer le test si `a != b` ;
- les méthodes `try_xxx` du client renvoient l'erreur au lieu de paniquer :
  - `Err(Ok(e))` : **notre** erreur ;
  - `Err(Err(_))` : erreur du réseau (autorisation...) ;
- `#[should_panic]` indique qu'on **attend** un échec (constructeur avec une config invalide).
