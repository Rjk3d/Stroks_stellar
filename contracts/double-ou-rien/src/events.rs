// =============================================================================
// events.rs — Les événements émis par le contrat.
//
// Un événement est un message que le contrat "publie" dans le résultat de la
// transaction. Il ne coûte presque rien, n'est pas lisible par les autres
// contrats, mais il est lisible par tout le monde hors chaîne via le RPC
// (`getEvents`). C'est ce que notre indexeur écoute.
//
// Structure d'un événement Soroban :
//   - topics : une liste courte de valeurs servant à FILTRER
//              (ici : le nom de l'événement + l'adresse du joueur)
//   - data   : le contenu (ici : une "map" nom_du_champ → valeur)
//
// `#[contractevent]` (syntaxe SDK >= 23) génère le code : le 1er topic est
// automatiquement le nom de la struct en snake_case ("round_played"...), et
// chaque champ marqué `#[topic]` est ajouté aux topics.
// =============================================================================

use soroban_sdk::{contractevent, Address};

// `crate::` = "depuis la racine de notre propre crate" (lib.rs).
use crate::types::{Move, Outcome};

/// Émis à CHAQUE tour (victoire, égalité ou défaite).
/// topics = ["round_played", player]
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoundPlayed {
    #[topic]
    pub player: Address,
    pub player_move: Move,
    pub bank_move: Move,
    pub outcome: Outcome,
    /// Pot APRÈS le tour (0 en cas de défaite).
    pub pot: i128,
    pub wins: u32,
    pub rounds: u32,
}

/// Émis quand le joueur encaisse. topics = ["cashed_out", player]
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CashedOut {
    #[topic]
    pub player: Address,
    pub bet: i128,
    /// Montant versé au joueur.
    pub amount: i128,
    /// Multiplicateur nominal atteint (2^wins).
    pub multiplier: u32,
}

/// Émis quand le joueur perd sa partie. topics = ["game_lost", player]
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GameLost {
    #[topic]
    pub player: Address,
    pub bet: i128,
    /// Pot perdu (gardé par la banque).
    pub lost_pot: i128,
    pub wins: u32,
}
