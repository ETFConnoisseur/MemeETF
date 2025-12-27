import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { generateTokenHash } from '@/lib/utils/tokenHash';
import { TokenInfo } from '@/types';
import { decryptPrivateKey, getKeypairFromPrivateKey } from '@/lib/solana/wallet';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { initializeEtf, getEtfPda, getConnection, PROGRAM_ID } from '@/lib/solana/program';

// Maximum tokens per ETF (smart contract space limitation)
const MAX_TOKENS_PER_ETF = 10;
// Maximum ETFs per user
const MAX_ETFS_PER_USER = 10;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[ETF Create] Request:', { name: body.name, userId: body.userId, tokens: body.tokens?.length });

    const { name, tokens, userId, network = 'devnet' } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'ETF name is required' }, { status: 400 });
    }

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one token is required' }, { status: 400 });
    }

    if (tokens.length > MAX_TOKENS_PER_ETF) {
      return NextResponse.json({ success: false, error: `Maximum ${MAX_TOKENS_PER_ETF} tokens allowed` }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 });
    }

    if (network !== 'devnet' && network !== 'mainnet-beta') {
      return NextResponse.json({ success: false, error: 'Invalid network. Must be devnet or mainnet-beta' }, { status: 400 });
    }

    // Validate token addresses
    const tokenPubkeys: PublicKey[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t.address || typeof t.address !== 'string') {
        return NextResponse.json({ success: false, error: `Token ${i + 1} missing address` }, { status: 400 });
      }
      try {
        tokenPubkeys.push(new PublicKey(t.address.trim()));
      } catch {
        return NextResponse.json({ success: false, error: `Token ${i + 1} has invalid address` }, { status: 400 });
      }
    }

    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    // Check for duplicate ETF (within the same network)
    const tokenHash = generateTokenHash(tokens);
    const duplicateCheck = await pool.query('SELECT id FROM etf_listings WHERE token_hash = $1 AND network = $2', [tokenHash, network]);
    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({ success: false, error: 'An ETF with these tokens already exists on this network' }, { status: 400 });
    }

    // Get user's protocol wallet and balance
    const walletResult = await pool.query(
      'SELECT w.encrypted_private_key, w.public_key, u.protocol_sol_balance FROM wallets w JOIN users u ON w.user_id = u.wallet_address WHERE w.user_id = $1',
      [userId]
    );

    if (walletResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Protocol wallet not found. Visit Portfolio first.' }, { status: 400 });
    }

    const { encrypted_private_key, public_key, protocol_sol_balance } = walletResult.rows[0];
    const balance = parseFloat(protocol_sol_balance || '0');

    if (balance < 0.01) {
      return NextResponse.json({
        success: false,
        error: `Need at least 0.01 SOL in your protocol balance. You have ${balance.toFixed(4)} SOL. Please deposit first.`
      }, { status: 400 });
    }

    // Decrypt private key and create keypair
    let keypair;
    try {
      const privateKey = decryptPrivateKey(encrypted_private_key);
      keypair = getKeypairFromPrivateKey(privateKey);
      
      if (keypair.publicKey.toString() !== public_key) {
        throw new Error('Keypair mismatch');
      }
    } catch (e) {
      console.error('[ETF Create] Keypair error:', e);
      return NextResponse.json({ success: false, error: 'Wallet security error' }, { status: 500 });
    }

    // Get connection and check on-chain balance
    const connection = getConnection(network);
    let onChainBalance = await connection.getBalance(keypair.publicKey);
    console.log(`[ETF Create] On-chain balance (${network}):`, onChainBalance / LAMPORTS_PER_SOL, 'SOL');

    // If protocol wallet has no SOL, request airdrop (devnet only)
    if (onChainBalance < 0.01 * LAMPORTS_PER_SOL) {
      if (network === 'devnet') {
        console.log('[ETF Create] Protocol wallet needs devnet SOL, requesting airdrop...');
        try {
          const airdropSignature = await connection.requestAirdrop(
            keypair.publicKey,
            1 * LAMPORTS_PER_SOL // Request 1 SOL
          );
          await connection.confirmTransaction(airdropSignature, 'confirmed');
          onChainBalance = await connection.getBalance(keypair.publicKey);
          console.log('[ETF Create] Airdrop successful! New balance:', onChainBalance / LAMPORTS_PER_SOL, 'SOL');
        } catch (airdropError: any) {
          console.error('[ETF Create] Airdrop failed:', airdropError.message);
          return NextResponse.json({
            success: false,
            error: `Protocol wallet needs devnet SOL for transaction fees. Airdrop failed: ${airdropError.message}`
          }, { status: 400 });
        }
      } else {
        return NextResponse.json({
          success: false,
          error: 'Insufficient SOL in protocol wallet for transaction fees. Please deposit SOL to your protocol wallet first.'
        }, { status: 400 });
      }
    }
    
    // Check if user has reached the maximum number of ETFs (for this network)
    const existingEtfCheck = await pool.query(
      'SELECT COUNT(*) as count FROM etf_listings WHERE creator = $1 AND network = $2',
      [userId, network]
    );

    const etfCount = parseInt(existingEtfCheck.rows[0].count || '0');
    if (etfCount >= MAX_ETFS_PER_USER) {
      return NextResponse.json({
        success: false,
        error: `You have reached the maximum of ${MAX_ETFS_PER_USER} ETFs on ${network}. Delete one to create a new one.`
      }, { status: 400 });
    }

    // Check if ETF PDA already exists on-chain for this wallet
    const [etfPda] = getEtfPda(keypair.publicKey);
    const existingAccount = await connection.getAccountInfo(etfPda);
    if (existingAccount) {
      console.log('[ETF Create] Warning: PDA exists on-chain but not in database. This may indicate a previous deletion. Proceeding with creation...');
      // Note: On mainnet, you'd want to close the existing PDA first or use a different approach
      // For now on devnet, we'll allow it to fail at the contract level if truly duplicate
    }

    // Initialize ETF on-chain
    console.log(`[ETF Create] Initializing on ${network}...`);
    console.log('[ETF Create] Lister:', keypair.publicKey.toString());
    console.log('[ETF Create] ETF PDA:', etfPda.toString());
    console.log('[ETF Create] Program ID:', PROGRAM_ID.toString());

    let signature: string;
    try {
      signature = await initializeEtf(connection, keypair, tokenPubkeys);
      console.log('[ETF Create] ✅ Success! TX:', signature);
      } catch (err: any) {
      console.error('[ETF Create] ❌ Failed:', err);

      if (err.message?.includes('already in use')) {
        return NextResponse.json({ success: false, error: 'ETF already exists for this wallet' }, { status: 400 });
        }
      if (err.message?.includes('insufficient')) {
        return NextResponse.json({ success: false, error: 'Insufficient SOL for transaction' }, { status: 400 });
      }

      return NextResponse.json({ success: false, error: `Transaction failed: ${err.message}` }, { status: 500 });
      }

    // Calculate initial market cap
    let initialMarketCap = 0;
    console.log('[ETF Create] Calculating initial market cap from tokens:');
    for (const token of tokens) {
      const mc = token.market_cap || 0;
      const weight = token.weight || 0;
      if (typeof mc === 'number' && !isNaN(mc) && isFinite(mc) && mc > 0) {
        const weighted = (mc * weight) / 100;
        console.log(`[ETF Create] ${token.symbol}: $${mc.toLocaleString()} × ${weight}% = $${weighted.toLocaleString()}`);
        initialMarketCap += weighted;
      }
    }
    console.log(`[ETF Create] Final initialMarketCap: $${initialMarketCap.toLocaleString()}`);

    // Save to database
    const result = await pool.query(
      `INSERT INTO etf_listings (name, creator, contract_address, market_cap_at_list, tokens, token_hash, network)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, creator, contract_address, market_cap_at_list, tokens, network, created_at`,
      [name, userId, etfPda.toString(), initialMarketCap, JSON.stringify(tokens), tokenHash, network]
    );

    // Deduct fee from protocol balance and record transaction
    await pool.query('UPDATE users SET protocol_sol_balance = protocol_sol_balance - 0.01 WHERE wallet_address = $1', [userId]);
    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, fees, status, tx_hash) VALUES ($1, 'buy', 0.01, 0.01, 'completed', $2)`,
      [userId, signature]
    );

    const etf = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      creator: result.rows[0].creator,
      contract_address: result.rows[0].contract_address,
      market_cap_at_list: parseFloat(result.rows[0].market_cap_at_list),
      tokens: typeof result.rows[0].tokens === 'string' ? JSON.parse(result.rows[0].tokens) : result.rows[0].tokens,
      created_at: result.rows[0].created_at,
    };

    return NextResponse.json({
      success: true,
      etf,
      txHash: signature,
      network: network,
      explorerUrl: network === 'mainnet-beta'
        ? `https://solscan.io/tx/${signature}`
        : `https://solscan.io/tx/${signature}?cluster=devnet`
    });
    
  } catch (error: any) {
    console.error('[ETF Create] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to create ETF' }, { status: 500 });
  }
}
