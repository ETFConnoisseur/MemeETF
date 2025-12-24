import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

const X_CLIENT_ID = process.env.X_CLIENT_ID || '';
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || '';
const X_REDIRECT_URI = process.env.X_REDIRECT_URI || 'https://www.memeetf.tech/settings';

// Handle X OAuth callback - exchange code for token and get user info
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, codeVerifier, state } = body;

    if (!code || !codeVerifier || !state) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
      return NextResponse.json({ 
        error: 'X OAuth not configured' 
      }, { status: 503 });
    }

    // Decode state to get wallet address
    let walletAddress: string;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      walletAddress = stateData.walletAddress;
    } catch (e) {
      return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: X_CLIENT_ID,
        redirect_uri: X_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('[X Auth] Token exchange failed:', errorData);
      return NextResponse.json({ error: 'Failed to exchange code for token' }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from X
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      console.error('[X Auth] Failed to get user info');
      return NextResponse.json({ error: 'Failed to get X user info' }, { status: 400 });
    }

    const userData = await userResponse.json();
    const xUsername = userData.data?.username;
    const xId = userData.data?.id;
    const xName = userData.data?.name;

    if (!xUsername) {
      return NextResponse.json({ error: 'Could not get X username' }, { status: 400 });
    }

    // Save to database
    const pool = getDatabasePool();
    if (pool) {
      await pool.query(
        `UPDATE users SET x_username = $1, updated_at = NOW() WHERE wallet_address = $2`,
        [xUsername, walletAddress]
      );
      console.log(`[X Auth] Connected @${xUsername} to wallet ${walletAddress}`);
    }

    return NextResponse.json({
      success: true,
      xUsername,
      xId,
      xName,
    });
  } catch (error: any) {
    console.error('[X Auth Callback] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

