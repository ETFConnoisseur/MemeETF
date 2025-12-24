/**
 * Direct Solana interaction with MTF ETF Program
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createHash } from 'crypto';

// Program ID - deployed on devnet
export const PROGRAM_ID = new PublicKey('6ZuD488g1DR652G2zmBsr7emXuQXQ26ZbkFZPyRyr627');

// Anchor instruction discriminators
function getDiscriminator(name: string): Buffer {
  const hash = createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

const DISC = {
  initializeEtf: getDiscriminator('initialize_etf'),
  buyEtf: getDiscriminator('buy_etf'),
  sellEtf: getDiscriminator('sell_etf'),
  claimFees: getDiscriminator('claim_fees'),
};

export function getConnection(network: 'devnet' | 'mainnet' = 'devnet'): Connection {
  const rpcUrl = network === 'mainnet' 
    ? 'https://api.mainnet-beta.solana.com'
    : process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

export function getEtfPda(listerPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('etf'), listerPubkey.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Initialize ETF - accounts: [etf, lister, system_program]
 */
export async function initializeEtf(
  connection: Connection,
  listerKeypair: Keypair,
  tokenAddresses: PublicKey[]
): Promise<string> {
  const [etfPda] = getEtfPda(listerKeypair.publicKey);
  
  // Data: discriminator + vec<pubkey>
  const vecLen = Buffer.alloc(4);
  vecLen.writeUInt32LE(tokenAddresses.length, 0);
  
  const data = Buffer.concat([
    DISC.initializeEtf,
    vecLen,
    ...tokenAddresses.map(pk => pk.toBuffer())
  ]);
  
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: etfPda, isSigner: false, isWritable: true },
      { pubkey: listerKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [listerKeypair], { commitment: 'confirmed' });
}

/**
 * Buy ETF - accounts: [etf, investor, lister_account, system_program]
 */
export async function buyEtf(
  connection: Connection,
  investorKeypair: Keypair,
  etfPda: PublicKey,
  listerPubkey: PublicKey,
  solAmount: number
): Promise<string> {
  const lamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
  
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(lamports, 0);
  
  const data = Buffer.concat([DISC.buyEtf, amountBuf]);
  
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: etfPda, isSigner: false, isWritable: true },
      { pubkey: investorKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: listerPubkey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [investorKeypair], { commitment: 'confirmed' });
}

/**
 * Sell ETF - accounts: [etf, investor, lister_account, system_program]
 */
export async function sellEtf(
  connection: Connection,
  investorKeypair: Keypair,
  etfPda: PublicKey,
  listerPubkey: PublicKey,
  tokensToSell: number
): Promise<string> {
  const tokens = BigInt(Math.floor(tokensToSell * LAMPORTS_PER_SOL));
  
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(tokens, 0);
  
  const data = Buffer.concat([DISC.sellEtf, amountBuf]);
  
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: etfPda, isSigner: false, isWritable: true },
      { pubkey: investorKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: listerPubkey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
  
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [investorKeypair], { commitment: 'confirmed' });
}
