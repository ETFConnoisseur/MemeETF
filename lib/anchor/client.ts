import { AnchorProvider, Program, Wallet, Idl } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getConnection, getKeypairFromPrivateKey } from '../solana/wallet';

// Re-export for convenience
export { getKeypairFromPrivateKey } from '../solana/wallet';

// Hardcoded Program ID - deployed on Solana devnet
const PROGRAM_ID_STRING = '6ZuD488g1DR652G2zmBsr7emXuQXQ26ZbkFZPyRyr627';

// Export for use elsewhere
export const PROGRAM_ID = PROGRAM_ID_STRING;

// Minimal IDL for MTF ETF Program
// Using 'as any' to bypass strict IDL type checking
const MTF_IDL: any = {
  version: "0.1.0",
  name: "mtf_etf",
  instructions: [
    {
      name: "initializeEtf",
      accounts: [
        { name: "etf" },
        { name: "lister" },
        { name: "systemProgram" }
      ],
      args: [
        { name: "tokenAddresses", type: { vec: "pubkey" } }
      ]
    },
    {
      name: "buyEtf",
      accounts: [
        { name: "etf" },
        { name: "investor" },
        { name: "investorAta" },
        { name: "etfVault" },
        { name: "listerAta" },
        { name: "systemProgram" }
      ],
      args: [
        { name: "solAmount", type: "u64" }
      ]
    },
    {
      name: "sellEtf",
      accounts: [
        { name: "etf" },
        { name: "investor" },
        { name: "investorAta" },
        { name: "etfVault" },
        { name: "listerAta" },
        { name: "systemProgram" }
      ],
      args: [
        { name: "tokensToSell", type: "u64" }
      ]
    },
    {
      name: "claimFees",
      accounts: [
        { name: "etf" },
        { name: "lister" },
        { name: "listerAta" },
        { name: "etfVault" },
        { name: "systemProgram" }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "ETF",
      type: {
        kind: "struct",
        fields: [
          { name: "lister", type: "pubkey" },
          { name: "tokenAddresses", type: { vec: "pubkey" } },
          { name: "totalSupply", type: "u64" },
          { name: "bump", type: "u8" }
        ]
      }
    }
  ],
  errors: [
    { code: 6000, name: "InsufficientFunds", msg: "Insufficient funds for this operation" },
    { code: 6001, name: "InvalidAmount", msg: "Invalid amount specified" },
    { code: 6002, name: "Unauthorized", msg: "You are not authorized to perform this action" }
  ]
};

/**
 * Get an Anchor provider configured with the given private key
 */
export function getAnchorProvider(privateKey?: string, network: 'mainnet' | 'devnet' = 'devnet'): AnchorProvider {
  const connection = getConnection(network);
  
  let wallet: Wallet;
  if (privateKey) {
    const keypair = getKeypairFromPrivateKey(privateKey);
    wallet = {
      publicKey: keypair.publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        if (tx instanceof Transaction) {
          tx.partialSign(keypair);
        }
        return tx;
      },
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        txs.forEach(tx => {
          if (tx instanceof Transaction) {
            tx.partialSign(keypair);
          }
        });
        return txs;
      },
      payer: keypair
    };
  } else {
    const keypair = Keypair.generate();
    wallet = {
      publicKey: keypair.publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => tx,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => txs,
      payer: keypair
    };
  }

  return new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

/**
 * Get the MTF ETF program instance
 */
export function getProgram(privateKey?: string, network: 'mainnet' | 'devnet' = 'devnet'): any {
  const provider = getAnchorProvider(privateKey, network);
  const programId = new PublicKey(PROGRAM_ID_STRING);
  
  // Create program with explicit programId
  // Using type assertion to bypass IDL type checking issues
  // @ts-ignore - IDL type mismatch
  return new Program(MTF_IDL, programId, provider);
}

/**
 * Get the PDA for an ETF created by a lister
 */
export function getEtfPda(listerPubkey: PublicKey): [PublicKey, number] {
  const programId = new PublicKey(PROGRAM_ID_STRING);
  
  return PublicKey.findProgramAddressSync(
    [Buffer.from("etf"), listerPubkey.toBuffer()],
    programId
  );
}

/**
 * Fetch an ETF account from the blockchain
 */
export async function fetchEtfAccount(etfPubkey: PublicKey, network: 'mainnet' | 'devnet' = 'devnet') {
  const program = getProgram(undefined, network);
  
  try {
    const etfAccount = await program.account.etf.fetch(etfPubkey);
    return {
      lister: (etfAccount.lister as PublicKey).toString(),
      tokenAddresses: (etfAccount.tokenAddresses as PublicKey[]).map((pk: PublicKey) => pk.toString()),
      totalSupply: (etfAccount.totalSupply as any).toNumber(),
      bump: etfAccount.bump,
    };
  } catch (error) {
    console.error('Failed to fetch ETF account:', error);
    return null;
  }
}

/**
 * Check if an ETF exists for a given lister
 */
export async function etfExistsForLister(listerPubkey: PublicKey, network: 'mainnet' | 'devnet' = 'devnet'): Promise<boolean> {
  const [etfPda] = getEtfPda(listerPubkey);
  const account = await fetchEtfAccount(etfPda, network);
  return account !== null;
}

/**
 * Get the program ID string
 */
export function getProgramId(): string {
  return PROGRAM_ID_STRING;
}
