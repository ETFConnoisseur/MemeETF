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
import { swapForEtfPurchase, type SwapResult } from './jupiterSwap';

// Program ID - deployed on devnet
export const PROGRAM_ID = new PublicKey('CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo');

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
  closeEtf: getDiscriminator('close_etf'),
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
 * Buy ETF - accounts: [etf, investor, lister_account, system_program, ...remaining_accounts]
 * New: includes token percentages and performs actual token swaps via Jupiter
 */
export async function buyEtf(
  connection: Connection,
  investorKeypair: Keypair,
  etfPda: PublicKey,
  listerPubkey: PublicKey,
  solAmount: number,
  tokenAddresses?: PublicKey[],
  tokenPercentages?: number[]
): Promise<{ mainTxSignature: string; swapSignatures: string[]; tokenSubstitutions: any[] }> {
  const lamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(lamports, 0);

  // Encode token percentages as Vec<u8>
  // The smart contract REQUIRES percentages, so if not provided, create equal distribution
  const percentages = tokenPercentages && tokenPercentages.length > 0
    ? tokenPercentages
    : tokenAddresses && tokenAddresses.length > 0
    ? tokenAddresses.map(() => Math.floor(100 / tokenAddresses.length))
    : [];

  // Round percentages to integers and ensure they sum to exactly 100
  let roundedPercentages = percentages.map(p => Math.round(p));
  const sum = roundedPercentages.reduce((a, b) => a + b, 0);

  // Adjust the last percentage to make the total exactly 100
  if (sum !== 100 && roundedPercentages.length > 0) {
    roundedPercentages[roundedPercentages.length - 1] += (100 - sum);
  }

  console.log('[BuyETF] Original percentages:', percentages);
  console.log('[BuyETF] Rounded percentages:', roundedPercentages, 'Sum:', roundedPercentages.reduce((a, b) => a + b, 0));

  const vecLen = Buffer.alloc(4);
  vecLen.writeUInt32LE(roundedPercentages.length, 0);

  const percentagesBuf = Buffer.from(roundedPercentages);

  const data = Buffer.concat([DISC.buyEtf, amountBuf, vecLen, percentagesBuf]);

  const keys = [
    { pubkey: etfPda, isSigner: false, isWritable: true },
    { pubkey: investorKeypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: listerPubkey, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // Add token mint accounts as remaining accounts for validation
  if (tokenAddresses && tokenAddresses.length > 0) {
    for (const tokenMint of tokenAddresses) {
      keys.push({ pubkey: tokenMint, isSigner: false, isWritable: false });
    }
  }

  const ix = new TransactionInstruction({
    keys,
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(ix);
  const mainTxSignature = await sendAndConfirmTransaction(connection, tx, [investorKeypair], { commitment: 'confirmed' });

  console.log('[BuyETF] ✅ Main transaction confirmed:', mainTxSignature);

  // Now perform actual token swaps via Jupiter
  const swapSignatures: string[] = [];
  const tokenSubstitutions: any[] = [];

  if (tokenAddresses && roundedPercentages && tokenAddresses.length > 0) {
    // Determine if we're on devnet or mainnet
    const isDevnet = connection.rpcEndpoint.includes('devnet');

    console.log(`[BuyETF] Executing swaps on ${isDevnet ? 'devnet' : 'mainnet'}...`);

    try {
      // Use the Jupiter swap service
      const swapResults: SwapResult[] = await swapForEtfPurchase(
        connection,
        investorKeypair,
        tokenAddresses,
        roundedPercentages,
        solAmount,
        isDevnet
      );

      // Process swap results
      for (let i = 0; i < swapResults.length; i++) {
        const result = swapResults[i];

        if (result.signature !== 'FAILED') {
          swapSignatures.push(result.signature);
        }

        tokenSubstitutions.push({
          originalToken: tokenAddresses[i].toBase58(),
          finalToken: result.outputMint,
          isSubstituted: result.outputMint !== tokenAddresses[i].toBase58(),
          solAmount: result.inputAmount,
          percentage: roundedPercentages[i],
          txSignature: result.signature,
          isDevnetMock: result.isDevnetMock,
          outputAmount: result.outputAmount,
        });

        console.log(`[BuyETF] ✅ Swap ${i + 1}/${swapResults.length} completed: ${result.signature}`);
      }
    } catch (err: any) {
      console.error('[BuyETF] Error during swaps:', err.message);
      // If swaps fail, record the error but don't fail the entire purchase
      tokenSubstitutions.push({
        error: err.message,
        message: 'Swaps failed but ETF shares were minted',
      });
    }
  }

  return { mainTxSignature, swapSignatures, tokenSubstitutions };
}

/**
 * Perform a Jupiter swap from SOL to a target token
 */
async function performJupiterSwap(
  connection: Connection,
  payerKeypair: Keypair,
  outputMint: PublicKey,
  solAmount: number
): Promise<string> {
  const inputMint = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  // Get Jupiter quote
  const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint.toBase58()}&amount=${lamports}&slippageBps=300`;

  console.log('[Jupiter] Fetching quote:', quoteUrl);
  const quoteResponse = await fetch(quoteUrl);

  if (!quoteResponse.ok) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.statusText}`);
  }

  const quoteData = await quoteResponse.json();

  // Get swap transaction
  const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: payerKeypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });

  if (!swapResponse.ok) {
    throw new Error(`Jupiter swap failed: ${swapResponse.statusText}`);
  }

  const { swapTransaction } = await swapResponse.json();

  // Deserialize and sign transaction
  const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
  const transaction = Transaction.from(swapTransactionBuf);

  transaction.partialSign(payerKeypair);

  // Send and confirm
  const signature = await sendAndConfirmTransaction(connection, transaction, [payerKeypair], {
    commitment: 'confirmed',
    skipPreflight: false,
  });

  return signature;
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

/**
 * Build unsigned ETF initialization transaction
 * NON-CUSTODIAL: User signs this with their wallet
 */
export async function buildUnsignedInitializeEtf(
  connection: Connection,
  listerPubkey: PublicKey,
  tokenAddresses: PublicKey[]
): Promise<{ transaction: string; etfPda: string }> {
  const [etfPda] = getEtfPda(listerPubkey);

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
      { pubkey: listerPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = listerPubkey;

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  // Serialize without signatures (user will sign on frontend)
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });

  return {
    transaction: serialized.toString('base64'),
    etfPda: etfPda.toBase58(),
  };
}

/**
 * Close ETF - accounts: [etf, lister, system_program]
 * Can only be called by the lister when total_supply is 0
 */
export async function closeEtf(
  connection: Connection,
  listerKeypair: Keypair
): Promise<string> {
  const [etfPda] = getEtfPda(listerKeypair.publicKey);

  const data = DISC.closeEtf;

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
