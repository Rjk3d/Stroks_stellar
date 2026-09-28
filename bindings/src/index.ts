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
    contractId: "CAHM2T2F2G2ZCWXLMNKSPPFFDGGDJMLYDMPMP4HN7DSLDMQ67Q3TE5PZ",
  }
} as const

/**
 * Un coup. `#[contracttype]` permet de l'utiliser en paramètre du contrat ;
 * côté TypeScript, il devient `Move.Rock`, `Move.Paper`, `Move.Scissors`.
 */
export enum Move {
  Rock = 0,
  Paper = 1,
  Scissors = 2,
}

/**
 * Les erreurs possibles. Le client les reçoit sous la forme `Error(Contract, #1)`.
 */
export const Errors = {
  /**
   * La mise doit être supérieure à 0.
   */
  1: {message:"InvalidBet"},
  /**
   * La banque n'a pas assez d'XLM pour payer le double de la mise.
   */
  2: {message:"BankTooPoor"}
}


/**
 * Ce que renvoie `play` : le coup de la banque, le résultat, et combien le
 * joueur reçoit (en stroops : 1 XLM = 10 000 000 stroops).
 */
export interface Round {
  bank_move: Move;
  outcome: Outcome;
  payout: i128;
}

/**
 * Le résultat d'une partie, du point de vue du joueur.
 */
export enum Outcome {
  Win = 0,
  Tie = 1,
  Loss = 2,
}

export interface Client {
  /**
   * Construct and simulate a play transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Joue une partie : `player` mise `bet` stroops en jouant `player_move`.
   */
  play: ({player, player_move, bet}: {player: string, player_move: Move, bet: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Round>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {token}: {token: string},
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
    return ContractClient.deploy({token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAwAAAJRVbiBjb3VwLiBgI1tjb250cmFjdHR5cGVdYCBwZXJtZXQgZGUgbCd1dGlsaXNlciBlbiBwYXJhbcOodHJlIGR1IGNvbnRyYXQgOwpjw7R0w6kgVHlwZVNjcmlwdCwgaWwgZGV2aWVudCBgTW92ZS5Sb2NrYCwgYE1vdmUuUGFwZXJgLCBgTW92ZS5TY2lzc29yc2AuAAAAAAAAAARNb3ZlAAAAAwAAAAAAAAAEUm9jawAAAAAAAAAAAAAABVBhcGVyAAAAAAAAAQAAAAAAAAAIU2Npc3NvcnMAAAAC",
        "AAAABAAAAFFMZXMgZXJyZXVycyBwb3NzaWJsZXMuIExlIGNsaWVudCBsZXMgcmXDp29pdCBzb3VzIGxhIGZvcm1lIGBFcnJvcihDb250cmFjdCwgIzEpYC4AAAAAAAAAAAAABUVycm9yAAAAAAAAAgAAACRMYSBtaXNlIGRvaXQgw6p0cmUgc3Vww6lyaWV1cmUgw6AgMC4AAAAKSW52YWxpZEJldAAAAAAAAQAAAD5MYSBiYW5xdWUgbidhIHBhcyBhc3NleiBkJ1hMTSBwb3VyIHBheWVyIGxlIGRvdWJsZSBkZSBsYSBtaXNlLgAAAAAAC0JhbmtUb29Qb29yAAAAAAI=",
        "AAAAAQAAAINDZSBxdWUgcmVudm9pZSBgcGxheWAgOiBsZSBjb3VwIGRlIGxhIGJhbnF1ZSwgbGUgcsOpc3VsdGF0LCBldCBjb21iaWVuIGxlCmpvdWV1ciByZcOnb2l0IChlbiBzdHJvb3BzIDogMSBYTE0gPSAxMCAwMDAgMDAwIHN0cm9vcHMpLgAAAAAAAAAABVJvdW5kAAAAAAAAAwAAAAAAAAAJYmFua19tb3ZlAAAAAAAH0AAAAARNb3ZlAAAAAAAAAAdvdXRjb21lAAAAB9AAAAAHT3V0Y29tZQAAAAAAAAAABnBheW91dAAAAAAACw==",
        "AAAAAwAAADVMZSByw6lzdWx0YXQgZCd1bmUgcGFydGllLCBkdSBwb2ludCBkZSB2dWUgZHUgam91ZXVyLgAAAAAAAAAAAAAHT3V0Y29tZQAAAAADAAAAAAAAAANXaW4AAAAAAAAAAAAAAAADVGllAAAAAAEAAAAAAAAABExvc3MAAAAC",
        "AAAAAAAAAEZKb3VlIHVuZSBwYXJ0aWUgOiBgcGxheWVyYCBtaXNlIGBiZXRgIHN0cm9vcHMgZW4gam91YW50IGBwbGF5ZXJfbW92ZWAuAAAAAAAEcGxheQAAAAMAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAALcGxheWVyX21vdmUAAAAH0AAAAARNb3ZlAAAAAAAAAANiZXQAAAAACwAAAAEAAAPpAAAH0AAAAAVSb3VuZAAAAAAAAAM=",
        "AAAAAAAAAEtBcHBlbMOpIHVuZSBzZXVsZSBmb2lzLCBhdSBkw6lwbG9pZW1lbnQgOiBvbiByZXRpZW50IHF1ZWwgdG9rZW4gb24gdXRpbGlzZS4AAAAADV9fY29uc3RydWN0b3IAAAAAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    play: this.txFromJSON<Result<Round>>
  }
}