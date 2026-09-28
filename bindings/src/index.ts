import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CAI7IXIL75RFOVQSUBLSSXX6CPTB6H2XQU6DVCS3QF44VUKARVGHW4JA",
  }
} as const


/**
 * Une partie en cours (une seule par joueur).
 */
export interface Game {
  /**
 * Mise initiale.
 */
bet: i128;
  /**
 * Pot actuel : ce que le joueur toucherait s'il encaissait maintenant.
 * 0 = partie perdue (terminée).
 */
pot: i128;
  /**
 * Nombre de tours joués (égalités comprises).
 */
rounds: u32;
  /**
 * Nombre de victoires d'affilée. Multiplicateur = 2^wins.
 */
wins: u32;
}

/**
 * Le coup joué : pierre, feuille ou ciseaux.
 * 
 * `#[repr(u32)]` + valeurs explicites (= 0, = 1, = 2) : l'enum est stocké
 * comme un simple entier u32. Côté TypeScript, les bindings génèrent un
 * `enum Move { Rock = 0, Paper = 1, Scissors = 2 }`.
 * 
 * `#[derive(...)]` demande au compilateur d'écrire automatiquement du code :
 * - Clone/Copy : on peut dupliquer la valeur librement (c'est juste un entier,
 * donc pas de problème d'"ownership", voir docs/02).
 * - Debug : affichable avec {:?} dans les tests.
 * - Eq/PartialEq : comparable avec ==.
 */
export enum Move {
  Rock = 0,
  Paper = 1,
  Scissors = 2,
}


/**
 * Statistiques cumulées d'un joueur.
 * `Default` : permet d'écrire `Stats::default()` → tout à zéro.
 */
export interface Stats {
  /**
 * Plus gros montant encaissé en une partie (stroops).
 */
biggest_win: i128;
  /**
 * Parties perdues.
 */
lost: u32;
  /**
 * Parties commencées.
 */
played: u32;
  /**
 * Parties encaissées (gagnées).
 */
won: u32;
}


/**
 * Configuration économique du casino (modifiable par l'admin).
 * 
 * Les montants sont en `i128` et en STROOPS : 1 XLM = 10 000 000 stroops.
 * Pourquoi i128 ? C'est le type standard des montants de tokens sur Soroban
 * (interface SEP-41) : assez grand pour ne jamais déborder.
 */
export interface Config {
  /**
 * Mise maximale (stroops).
 */
max_bet: i128;
  /**
 * Multiplicateur maximal (ex. 32 → au plus 5 victoires d'affilée).
 * Chaque victoire double exactement le pot.
 */
max_multiplier: u32;
  /**
 * Mise minimale (stroops).
 */
min_bet: i128;
}

/**
 * Résultat d'un tour, renvoyé par `start` et `play`.
 */
export enum Outcome {
  Win = 0,
  Tie = 1,
  Loss = 2,
}


/**
 * État de la banque, pour que le front affiche ce qu'elle peut couvrir.
 */
export interface BankInfo {
  /**
 * balance - reserved : ce que la banque peut encore risquer ou retirer.
 */
available: i128;
  /**
 * Solde total du contrat en XLM (stroops).
 */
balance: i128;
  /**
 * Somme des pots des parties en cours : argent déjà "promis" aux joueurs.
 */
reserved: i128;
}

export const Errors = {
  /**
   * Le joueur a déjà une partie en cours : il doit jouer ou encaisser avant d'en lancer une autre.
   */
  1: {message:"GameAlreadyInProgress"},
  /**
   * `play` ou `cash_out` sans partie en cours.
   */
  2: {message:"NoGameInProgress"},
  /**
   * Mise < config.min_bet.
   */
  3: {message:"BetTooLow"},
  /**
   * Mise > config.max_bet.
   */
  4: {message:"BetTooHigh"},
  /**
   * La banque ne pourrait pas payer le pot doublé si le joueur gagnait.
   */
  5: {message:"BankInsufficient"},
  /**
   * Le prochain gain dépasserait config.max_multiplier : il faut encaisser.
   */
  6: {message:"MaxMultiplierReached"},
  /**
   * Encaissement impossible tant qu'aucun tour n'a été gagné.
   */
  7: {message:"NothingToCashOut"},
  /**
   * Configuration incohérente (min <= 0, min > max, multiplicateur max < 2).
   */
  8: {message:"InvalidConfig"},
  /**
   * L'admin veut retirer plus que les fonds libres (solde - pots réservés).
   */
  9: {message:"InsufficientBankForWithdraw"},
  /**
   * Montant négatif ou nul.
   */
  10: {message:"InvalidAmount"}
}




export interface Client {
  /**
   * Construct and simulate a play transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remet tout le pot en jeu pour un nouveau tour.
   */
  play: ({player, player_move}: {player: string, player_move: Move}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Outcome>>>

  /**
   * Construct and simulate a start transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lance une partie : mise `bet` stroops et joue le premier tour.
   * 
   * `Result<Outcome, Error>` : soit `Ok(résultat)`, soit `Err(code)`.
   * Rust n'a pas d'exceptions : les erreurs sont des VALEURS de retour.
   */
  start: ({player, player_move, bet}: {player: string, player_move: Move, bet: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Outcome>>>

  /**
   * Construct and simulate a cash_out transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Encaisse le pot et termine la partie. Renvoie le montant versé.
   */
  cash_out: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_bank transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * L'état de la banque : solde, montant réservé, montant disponible.
   */
  get_bank: (options?: MethodOptions) => Promise<AssembledTransaction<BankInfo>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * La partie en cours du joueur, ou `None` (→ `undefined` côté TypeScript).
   */
  get_game: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Game>>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * L'admin retire des XLM de la banque, sans toucher à l'argent promis aux joueurs.
   */
  withdraw: ({amount}: {amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Les statistiques du joueur (tout à zéro s'il n'a jamais joué).
   */
  get_stats: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<Stats>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * La configuration actuelle (limites de mise, multiplicateur max, taux).
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Config>>

  /**
   * Construct and simulate a set_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * L'admin remplace la configuration.
   */
  set_config: ({config}: {config: Config}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, token, config}: {admin: string, token: string, config: Config},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, token, config}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAC5SZW1ldCB0b3V0IGxlIHBvdCBlbiBqZXUgcG91ciB1biBub3V2ZWF1IHRvdXIuAAAAAAAEcGxheQAAAAIAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAALcGxheWVyX21vdmUAAAAH0AAAAARNb3ZlAAAAAQAAA+kAAAfQAAAAB091dGNvbWUAAAAAAw==",
        "AAAAAAAAAMZMYW5jZSB1bmUgcGFydGllIDogbWlzZSBgYmV0YCBzdHJvb3BzIGV0IGpvdWUgbGUgcHJlbWllciB0b3VyLgoKYFJlc3VsdDxPdXRjb21lLCBFcnJvcj5gIDogc29pdCBgT2socsOpc3VsdGF0KWAsIHNvaXQgYEVycihjb2RlKWAuClJ1c3QgbidhIHBhcyBkJ2V4Y2VwdGlvbnMgOiBsZXMgZXJyZXVycyBzb250IGRlcyBWQUxFVVJTIGRlIHJldG91ci4AAAAAAAVzdGFydAAAAAAAAAMAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAALcGxheWVyX21vdmUAAAAH0AAAAARNb3ZlAAAAAAAAAANiZXQAAAAACwAAAAEAAAPpAAAH0AAAAAdPdXRjb21lAAAAAAM=",
        "AAAAAAAAAEBFbmNhaXNzZSBsZSBwb3QgZXQgdGVybWluZSBsYSBwYXJ0aWUuIFJlbnZvaWUgbGUgbW9udGFudCB2ZXJzw6kuAAAACGNhc2hfb3V0AAAAAQAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAERMJ8OpdGF0IGRlIGxhIGJhbnF1ZSA6IHNvbGRlLCBtb250YW50IHLDqXNlcnbDqSwgbW9udGFudCBkaXNwb25pYmxlLgAAAAhnZXRfYmFuawAAAAAAAAABAAAH0AAAAAhCYW5rSW5mbw==",
        "AAAAAAAAAExMYSBwYXJ0aWUgZW4gY291cnMgZHUgam91ZXVyLCBvdSBgTm9uZWAgKOKGkiBgdW5kZWZpbmVkYCBjw7R0w6kgVHlwZVNjcmlwdCkuAAAACGdldF9nYW1lAAAAAQAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAA+gAAAfQAAAABEdhbWU=",
        "AAAAAAAAAFFMJ2FkbWluIHJldGlyZSBkZXMgWExNIGRlIGxhIGJhbnF1ZSwgc2FucyB0b3VjaGVyIMOgIGwnYXJnZW50IHByb21pcyBhdXggam91ZXVycy4AAAAAAAAId2l0aGRyYXcAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAEFMZXMgc3RhdGlzdGlxdWVzIGR1IGpvdWV1ciAodG91dCDDoCB6w6lybyBzJ2lsIG4nYSBqYW1haXMgam91w6kpLgAAAAAAAAlnZXRfc3RhdHMAAAAAAAABAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAH0AAAAAVTdGF0cwAAAA==",
        "AAAAAAAAAEZMYSBjb25maWd1cmF0aW9uIGFjdHVlbGxlIChsaW1pdGVzIGRlIG1pc2UsIG11bHRpcGxpY2F0ZXVyIG1heCwgdGF1eCkuAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAABkNvbmZpZwAA",
        "AAAAAAAAACJMJ2FkbWluIHJlbXBsYWNlIGxhIGNvbmZpZ3VyYXRpb24uAAAAAAAKc2V0X2NvbmZpZwAAAAAAAQAAAAAAAAAGY29uZmlnAAAAAAfQAAAABkNvbmZpZwAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAb9BcHBlbMOpIFVORSBTRVVMRSBGT0lTLCBhdXRvbWF0aXF1ZW1lbnQsIGF1IG1vbWVudCBkdSBkw6lwbG9pZW1lbnQKKGBzdGVsbGFyIGNvbnRyYWN0IGRlcGxveSAuLi4gLS0gLS1hZG1pbiAuLi4gLS10b2tlbiAuLi4gLS1jb25maWcgLi4uYCkuCkltcG9zc2libGUgZGUgbGUgcmFwcGVsZXIgZW5zdWl0ZSA6IHBlcnNvbm5lIG5lIHBldXQgInLDqWluaXRpYWxpc2VyIgpsZSBjb250cmF0IHBvdXIgZW4gcHJlbmRyZSBsZSBjb250csO0bGUuCgpgZW52OiBFbnZgIDogbCdlbnZpcm9ubmVtZW50IGQnZXjDqWN1dGlvbiwgbm90cmUgcG9ydGUgZCdhY2PDqHMgw6AgVE9VVAooc3RvY2thZ2UsIMOpdsOpbmVtZW50cywgaGFzYXJkLCBhZHJlc3NlIGR1IGNvbnRyYXQuLi4pLiBJbCBlc3QgcGFzc8OpCmVuIHByZW1pZXIgcGFyYW3DqHRyZSBkZSBjaGFxdWUgZm9uY3Rpb24gZHUgY29udHJhdC4AAAAADV9fY29uc3RydWN0b3IAAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGY29uZmlnAAAAAAfQAAAABkNvbmZpZwAAAAAAAA==",
        "AAAAAQAAACtVbmUgcGFydGllIGVuIGNvdXJzICh1bmUgc2V1bGUgcGFyIGpvdWV1cikuAAAAAAAAAAAER2FtZQAAAAQAAAAOTWlzZSBpbml0aWFsZS4AAAAAAANiZXQAAAAACwAAAGNQb3QgYWN0dWVsIDogY2UgcXVlIGxlIGpvdWV1ciB0b3VjaGVyYWl0IHMnaWwgZW5jYWlzc2FpdCBtYWludGVuYW50LgowID0gcGFydGllIHBlcmR1ZSAodGVybWluw6llKS4AAAAAA3BvdAAAAAALAAAALk5vbWJyZSBkZSB0b3VycyBqb3XDqXMgKMOpZ2FsaXTDqXMgY29tcHJpc2VzKS4AAAAAAAZyb3VuZHMAAAAAAAQAAAA4Tm9tYnJlIGRlIHZpY3RvaXJlcyBkJ2FmZmlsw6llLiBNdWx0aXBsaWNhdGV1ciA9IDJed2lucy4AAAAEd2lucwAAAAQ=",
        "AAAAAwAAAhRMZSBjb3VwIGpvdcOpIDogcGllcnJlLCBmZXVpbGxlIG91IGNpc2VhdXguCgpgI1tyZXByKHUzMildYCArIHZhbGV1cnMgZXhwbGljaXRlcyAoPSAwLCA9IDEsID0gMikgOiBsJ2VudW0gZXN0IHN0b2Nrw6kKY29tbWUgdW4gc2ltcGxlIGVudGllciB1MzIuIEPDtHTDqSBUeXBlU2NyaXB0LCBsZXMgYmluZGluZ3MgZ8OpbsOocmVudCB1bgpgZW51bSBNb3ZlIHsgUm9jayA9IDAsIFBhcGVyID0gMSwgU2Npc3NvcnMgPSAyIH1gLgoKYCNbZGVyaXZlKC4uLildYCBkZW1hbmRlIGF1IGNvbXBpbGF0ZXVyIGQnw6ljcmlyZSBhdXRvbWF0aXF1ZW1lbnQgZHUgY29kZSA6Ci0gQ2xvbmUvQ29weSA6IG9uIHBldXQgZHVwbGlxdWVyIGxhIHZhbGV1ciBsaWJyZW1lbnQgKGMnZXN0IGp1c3RlIHVuIGVudGllciwKZG9uYyBwYXMgZGUgcHJvYmzDqG1lIGQnIm93bmVyc2hpcCIsIHZvaXIgZG9jcy8wMikuCi0gRGVidWcgOiBhZmZpY2hhYmxlIGF2ZWMgezo/fSBkYW5zIGxlcyB0ZXN0cy4KLSBFcS9QYXJ0aWFsRXEgOiBjb21wYXJhYmxlIGF2ZWMgPT0uAAAAAAAAAARNb3ZlAAAAAwAAAAAAAAAEUm9jawAAAAAAAAAAAAAABVBhcGVyAAAAAAAAAQAAAAAAAAAIU2Npc3NvcnMAAAAC",
        "AAAAAQAAAGZTdGF0aXN0aXF1ZXMgY3VtdWzDqWVzIGQndW4gam91ZXVyLgpgRGVmYXVsdGAgOiBwZXJtZXQgZCfDqWNyaXJlIGBTdGF0czo6ZGVmYXVsdCgpYCDihpIgdG91dCDDoCB6w6lyby4AAAAAAAAAAAAFU3RhdHMAAAAAAAAEAAAANFBsdXMgZ3JvcyBtb250YW50IGVuY2Fpc3PDqSBlbiB1bmUgcGFydGllIChzdHJvb3BzKS4AAAALYmlnZ2VzdF93aW4AAAAACwAAABBQYXJ0aWVzIHBlcmR1ZXMuAAAABGxvc3QAAAAEAAAAFFBhcnRpZXMgY29tbWVuY8OpZXMuAAAABnBsYXllZAAAAAAABAAAAB9QYXJ0aWVzIGVuY2Fpc3PDqWVzIChnYWduw6llcykuAAAAAAN3b24AAAAABA==",
        "AAAAAQAAAQtDb25maWd1cmF0aW9uIMOpY29ub21pcXVlIGR1IGNhc2lubyAobW9kaWZpYWJsZSBwYXIgbCdhZG1pbikuCgpMZXMgbW9udGFudHMgc29udCBlbiBgaTEyOGAgZXQgZW4gU1RST09QUyA6IDEgWExNID0gMTAgMDAwIDAwMCBzdHJvb3BzLgpQb3VycXVvaSBpMTI4ID8gQydlc3QgbGUgdHlwZSBzdGFuZGFyZCBkZXMgbW9udGFudHMgZGUgdG9rZW5zIHN1ciBTb3JvYmFuCihpbnRlcmZhY2UgU0VQLTQxKSA6IGFzc2V6IGdyYW5kIHBvdXIgbmUgamFtYWlzIGTDqWJvcmRlci4AAAAAAAAAAAZDb25maWcAAAAAAAMAAAAYTWlzZSBtYXhpbWFsZSAoc3Ryb29wcykuAAAAB21heF9iZXQAAAAACwAAAG1NdWx0aXBsaWNhdGV1ciBtYXhpbWFsIChleC4gMzIg4oaSIGF1IHBsdXMgNSB2aWN0b2lyZXMgZCdhZmZpbMOpZSkuCkNoYXF1ZSB2aWN0b2lyZSBkb3VibGUgZXhhY3RlbWVudCBsZSBwb3QuAAAAAAAADm1heF9tdWx0aXBsaWVyAAAAAAAEAAAAGE1pc2UgbWluaW1hbGUgKHN0cm9vcHMpLgAAAAdtaW5fYmV0AAAAAAs=",
        "AAAAAwAAADRSw6lzdWx0YXQgZCd1biB0b3VyLCByZW52b3nDqSBwYXIgYHN0YXJ0YCBldCBgcGxheWAuAAAAAAAAAAdPdXRjb21lAAAAAAMAAAAAAAAAA1dpbgAAAAAAAAAAAAAAAANUaWUAAAAAAQAAAAAAAAAETG9zcwAAAAI=",
        "AAAAAQAAAEbDiXRhdCBkZSBsYSBiYW5xdWUsIHBvdXIgcXVlIGxlIGZyb250IGFmZmljaGUgY2UgcXUnZWxsZSBwZXV0IGNvdXZyaXIuAAAAAAAAAAAACEJhbmtJbmZvAAAAAwAAAEViYWxhbmNlIC0gcmVzZXJ2ZWQgOiBjZSBxdWUgbGEgYmFucXVlIHBldXQgZW5jb3JlIHJpc3F1ZXIgb3UgcmV0aXJlci4AAAAAAAAJYXZhaWxhYmxlAAAAAAAACwAAAChTb2xkZSB0b3RhbCBkdSBjb250cmF0IGVuIFhMTSAoc3Ryb29wcykuAAAAB2JhbGFuY2UAAAAACwAAAElTb21tZSBkZXMgcG90cyBkZXMgcGFydGllcyBlbiBjb3VycyA6IGFyZ2VudCBkw6lqw6AgInByb21pcyIgYXV4IGpvdWV1cnMuAAAAAAAACHJlc2VydmVkAAAACw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACgAAAGBMZSBqb3VldXIgYSBkw6lqw6AgdW5lIHBhcnRpZSBlbiBjb3VycyA6IGlsIGRvaXQgam91ZXIgb3UgZW5jYWlzc2VyIGF2YW50IGQnZW4gbGFuY2VyIHVuZSBhdXRyZS4AAAAVR2FtZUFscmVhZHlJblByb2dyZXNzAAAAAAAAAQAAACpgcGxheWAgb3UgYGNhc2hfb3V0YCBzYW5zIHBhcnRpZSBlbiBjb3Vycy4AAAAAABBOb0dhbWVJblByb2dyZXNzAAAAAgAAABZNaXNlIDwgY29uZmlnLm1pbl9iZXQuAAAAAAAJQmV0VG9vTG93AAAAAAAAAwAAABZNaXNlID4gY29uZmlnLm1heF9iZXQuAAAAAAAKQmV0VG9vSGlnaAAAAAAABAAAAERMYSBiYW5xdWUgbmUgcG91cnJhaXQgcGFzIHBheWVyIGxlIHBvdCBkb3VibMOpIHNpIGxlIGpvdWV1ciBnYWduYWl0LgAAABBCYW5rSW5zdWZmaWNpZW50AAAABQAAAEhMZSBwcm9jaGFpbiBnYWluIGTDqXBhc3NlcmFpdCBjb25maWcubWF4X211bHRpcGxpZXIgOiBpbCBmYXV0IGVuY2Fpc3Nlci4AAAAUTWF4TXVsdGlwbGllclJlYWNoZWQAAAAGAAAAPEVuY2Fpc3NlbWVudCBpbXBvc3NpYmxlIHRhbnQgcXUnYXVjdW4gdG91ciBuJ2Egw6l0w6kgZ2FnbsOpLgAAABBOb3RoaW5nVG9DYXNoT3V0AAAABwAAAElDb25maWd1cmF0aW9uIGluY29ow6lyZW50ZSAobWluIDw9IDAsIG1pbiA+IG1heCwgbXVsdGlwbGljYXRldXIgbWF4IDwgMikuAAAAAAAADUludmFsaWRDb25maWcAAAAAAAAIAAAASUwnYWRtaW4gdmV1dCByZXRpcmVyIHBsdXMgcXVlIGxlcyBmb25kcyBsaWJyZXMgKHNvbGRlIC0gcG90cyByw6lzZXJ2w6lzKS4AAAAAAAAbSW5zdWZmaWNpZW50QmFua0ZvcldpdGhkcmF3AAAAAAkAAAAYTW9udGFudCBuw6lnYXRpZiBvdSBudWwuAAAADUludmFsaWRBbW91bnQAAAAAAAAK",
        "AAAABQAAAETDiW1pcyBxdWFuZCBsZSBqb3VldXIgcGVyZCBzYSBwYXJ0aWUuIHRvcGljcyA9IFsiZ2FtZV9sb3N0IiwgcGxheWVyXQAAAAAAAAAIR2FtZUxvc3QAAAABAAAACWdhbWVfbG9zdAAAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAAAAAAAA2JldAAAAAALAAAAAAAAACFQb3QgcGVyZHUgKGdhcmTDqSBwYXIgbGEgYmFucXVlKS4AAAAAAAAIbG9zdF9wb3QAAAALAAAAAAAAAAAAAAAEd2lucwAAAAQAAAAAAAAAAg==",
        "AAAABQAAAD/DiW1pcyBxdWFuZCBsZSBqb3VldXIgZW5jYWlzc2UuIHRvcGljcyA9IFsiY2FzaGVkX291dCIsIHBsYXllcl0AAAAAAAAAAAlDYXNoZWRPdXQAAAAAAAABAAAACmNhc2hlZF9vdXQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAAAAAAAA2JldAAAAAALAAAAAAAAABlNb250YW50IHZlcnPDqSBhdSBqb3VldXIuAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAoTXVsdGlwbGljYXRldXIgbm9taW5hbCBhdHRlaW50ICgyXndpbnMpLgAAAAptdWx0aXBsaWVyAAAAAAAEAAAAAAAAAAI=",
        "AAAABQAAAFnDiW1pcyDDoCBDSEFRVUUgdG91ciAodmljdG9pcmUsIMOpZ2FsaXTDqSBvdSBkw6lmYWl0ZSkuCnRvcGljcyA9IFsicm91bmRfcGxheWVkIiwgcGxheWVyXQAAAAAAAAAAAAALUm91bmRQbGF5ZWQAAAAAAQAAAAxyb3VuZF9wbGF5ZWQAAAAHAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAAAAAAAAtwbGF5ZXJfbW92ZQAAAAfQAAAABE1vdmUAAAAAAAAAAAAAAAliYW5rX21vdmUAAAAAAAfQAAAABE1vdmUAAAAAAAAAAAAAAAdvdXRjb21lAAAAB9AAAAAHT3V0Y29tZQAAAAAAAAAAKlBvdCBBUFLDiFMgbGUgdG91ciAoMCBlbiBjYXMgZGUgZMOpZmFpdGUpLgAAAAAAA3BvdAAAAAALAAAAAAAAAAAAAAAEd2lucwAAAAQAAAAAAAAAAAAAAAZyb3VuZHMAAAAAAAQAAAAAAAAAAg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    play: this.txFromJSON<Result<Outcome>>,
        start: this.txFromJSON<Result<Outcome>>,
        cash_out: this.txFromJSON<Result<i128>>,
        get_bank: this.txFromJSON<BankInfo>,
        get_game: this.txFromJSON<Option<Game>>,
        withdraw: this.txFromJSON<Result<void>>,
        get_stats: this.txFromJSON<Stats>,
        get_config: this.txFromJSON<Config>,
        set_config: this.txFromJSON<Result<void>>
  }
}