// =============================================================================
// types.rs — Les structures de données du jeu.
//
// Tout ce qui est STOCKÉ dans la blockchain, PASSÉ en paramètre ou RETOURNÉ par
// le contrat doit pouvoir être converti dans le format universel de Soroban
// (les "Val" / XDR). La macro `#[contracttype]` génère ce code de conversion
// pour nous, et c'est aussi elle qui permet à `stellar contract bindings`
// de générer les types TypeScript équivalents pour le front.
// =============================================================================

// `use` importe des noms depuis une autre "crate" (bibliothèque Rust).
// Address = une adresse Stellar (compte "G..." ou contrat "C...").
use soroban_sdk::{contracttype, Address};

/// Le coup joué : pierre, feuille ou ciseaux.
///
/// `#[repr(u32)]` + valeurs explicites (= 0, = 1, = 2) : l'enum est stocké
/// comme un simple entier u32. Côté TypeScript, les bindings génèrent un
/// `enum Move { Rock = 0, Paper = 1, Scissors = 2 }`.
///
/// `#[derive(...)]` demande au compilateur d'écrire automatiquement du code :
/// - Clone/Copy : on peut dupliquer la valeur librement (c'est juste un entier,
///   donc pas de problème d'"ownership", voir docs/02).
/// - Debug : affichable avec {:?} dans les tests.
/// - Eq/PartialEq : comparable avec ==.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Move {
    Rock = 0,
    Paper = 1,
    Scissors = 2,
}

// `impl Move` = on ajoute des méthodes au type Move.
impl Move {
    /// Convertit un nombre aléatoire 0, 1 ou 2 en coup.
    /// `match` doit couvrir TOUS les cas : `_` attrape "tout le reste".
    /// Ici, `_` ne peut être que 2 car on tire toujours dans 0..=2.
    pub fn from_index(index: u64) -> Move {
        match index {
            0 => Move::Rock,
            1 => Move::Paper,
            _ => Move::Scissors,
        }
    }

    /// Vrai si `self` bat `other`.
    /// `self` (sans &) : on prend la valeur par copie, possible car Move est `Copy`.
    /// `matches!` est une macro qui renvoie true si la valeur correspond
    /// à l'un des motifs séparés par `|`.
    pub fn beats(self, other: Move) -> bool {
        matches!(
            (self, other),
            (Move::Rock, Move::Scissors) | (Move::Paper, Move::Rock) | (Move::Scissors, Move::Paper)
        )
    }
}

/// Résultat d'un tour, renvoyé par `start` et `play`.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Outcome {
    Win = 0,
    Tie = 1,
    Loss = 2,
}

/// Configuration économique du casino (modifiable par l'admin).
///
/// Les montants sont en `i128` et en STROOPS : 1 XLM = 10 000 000 stroops.
/// Pourquoi i128 ? C'est le type standard des montants de tokens sur Soroban
/// (interface SEP-41) : assez grand pour ne jamais déborder.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Mise minimale (stroops).
    pub min_bet: i128,
    /// Mise maximale (stroops).
    pub max_bet: i128,
    /// Multiplicateur maximal (ex. 32 → au plus 5 victoires d'affilée).
    /// Chaque victoire double exactement le pot.
    pub max_multiplier: u32,
}

/// Une partie en cours (une seule par joueur).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    /// Mise initiale.
    pub bet: i128,
    /// Pot actuel : ce que le joueur toucherait s'il encaissait maintenant.
    /// 0 = partie perdue (terminée).
    pub pot: i128,
    /// Nombre de victoires d'affilée. Multiplicateur = 2^wins.
    pub wins: u32,
    /// Nombre de tours joués (égalités comprises).
    pub rounds: u32,
}

/// Statistiques cumulées d'un joueur.
/// `Default` : permet d'écrire `Stats::default()` → tout à zéro.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Stats {
    /// Parties commencées.
    pub played: u32,
    /// Parties encaissées (gagnées).
    pub won: u32,
    /// Parties perdues.
    pub lost: u32,
    /// Plus gros montant encaissé en une partie (stroops).
    pub biggest_win: i128,
}

/// État de la banque, pour que le front affiche ce qu'elle peut couvrir.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BankInfo {
    /// Solde total du contrat en XLM (stroops).
    pub balance: i128,
    /// Somme des pots des parties en cours : argent déjà "promis" aux joueurs.
    pub reserved: i128,
    /// balance - reserved : ce que la banque peut encore risquer ou retirer.
    pub available: i128,
}

/// Les CLÉS du stockage. Chaque variante désigne une case de stockage.
///
/// Une variante peut porter une donnée : `Game(Address)` crée une clé
/// DIFFÉRENTE par joueur, comme un dictionnaire { joueur → partie }.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    // ---- stockage INSTANCE (global au contrat, voir lib.rs) ----
    Admin,
    Token,
    Config,
    Reserved,
    // ---- stockage PERSISTENT (une entrée par joueur) ----
    Game(Address),
    Stats(Address),
}
