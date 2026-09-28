// =============================================================================
// Double ou Rien : pierre-feuille-ciseaux contre la banque.
//
// La "banque" est ce contrat : il possède des XLM.
//   - Le joueur choisit un coup et mise.
//   - La banque tire son coup au hasard.
//   - Gagné   → la banque paie le double de la mise.
//   - Perdu   → la banque garde la mise.
//   - Égalité → le joueur est remboursé.
// =============================================================================

// Un contrat tourne dans une petite machine virtuelle (WASM) sans système
// d'exploitation : on désactive la bibliothèque standard de Rust.
#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

// Les tests ne sont compilés que pendant `cargo test`.
#[cfg(test)]
mod test;

// -----------------------------------------------------------------------------
// Les types
// -----------------------------------------------------------------------------

/// Un coup. `#[contracttype]` permet de l'utiliser en paramètre du contrat ;
/// côté TypeScript, il devient `Move.Rock`, `Move.Paper`, `Move.Scissors`.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Move {
    Rock = 0,
    Paper = 1,
    Scissors = 2,
}

/// Le résultat d'une partie, du point de vue du joueur.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Outcome {
    Win = 0,
    Tie = 1,
    Loss = 2,
}

/// Ce que renvoie `play` : le coup de la banque, le résultat, et combien le
/// joueur reçoit (en stroops : 1 XLM = 10 000 000 stroops).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Round {
    pub bank_move: Move,
    pub outcome: Outcome,
    pub payout: i128,
}

/// Les erreurs possibles. Le client les reçoit sous la forme `Error(Contract, #1)`.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// La mise doit être supérieure à 0.
    InvalidBet = 1,
    /// La banque n'a pas assez d'XLM pour payer le double de la mise.
    BankTooPoor = 2,
}

/// La seule donnée stockée par le contrat : l'adresse du token (le XLM).
#[contracttype]
pub enum DataKey {
    Token,
}

// -----------------------------------------------------------------------------
// Le contrat
// -----------------------------------------------------------------------------

#[contract]
pub struct DoubleOuRien;

#[contractimpl]
impl DoubleOuRien {
    /// Appelé une seule fois, au déploiement : on retient quel token on utilise.
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Joue une partie : `player` mise `bet` stroops en jouant `player_move`.
    pub fn play(env: Env, player: Address, player_move: Move, bet: i128) -> Result<Round, Error> {
        // Le joueur doit avoir signé la transaction : personne ne peut miser
        // l'argent de quelqu'un d'autre.
        player.require_auth();

        if bet <= 0 {
            return Err(Error::InvalidBet);
        }

        // Le client du token XLM, pour faire des transferts.
        let token_id: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let xlm = token::Client::new(&env, &token_id);
        let bank = env.current_contract_address();

        // Si le joueur gagne, la banque lui rend 2 × la mise : sa mise à lui
        // + une mise payée par la banque. La caisse doit donc contenir au moins `bet`.
        if xlm.balance(&bank) < bet {
            return Err(Error::BankTooPoor);
        }

        // 1. Le joueur envoie sa mise à la banque.
        xlm.transfer(&player, &bank, &bet);

        // 2. La banque tire son coup au hasard : 0, 1 ou 2.
        let bank_move = match env.prng().gen_range::<u64>(0..=2) {
            0 => Move::Rock,
            1 => Move::Paper,
            _ => Move::Scissors,
        };

        // 3. Qui gagne ? Pierre bat ciseaux, feuille bat pierre, ciseaux battent feuille.
        let outcome = if player_move == bank_move {
            Outcome::Tie
        } else if matches!(
            (player_move, bank_move),
            (Move::Rock, Move::Scissors) | (Move::Paper, Move::Rock) | (Move::Scissors, Move::Paper)
        ) {
            Outcome::Win
        } else {
            Outcome::Loss
        };

        // 4. Ce que la banque rend au joueur.
        let payout = match outcome {
            Outcome::Win => bet * 2, // sa mise + le gain
            Outcome::Tie => bet,     // remboursé
            Outcome::Loss => 0,      // la banque garde tout
        };

        // On fait TOUJOURS ce transfert, même de 0 : ainsi chaque partie coûte
        // la même chose en frais, quel que soit le résultat du hasard.
        xlm.transfer(&bank, &player, &payout);

        Ok(Round { bank_move, outcome, payout })
    }
}
