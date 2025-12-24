import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// X OAuth 2.0 with PKCE
const X_CLIENT_ID = process.env.X_CLIENT_ID || '';
const X_REDIRECT_URI = process.env.X_REDIRECT_URI || 'https://www.memeetf.tech/settings';

// Debug: Log env vars (remove in production)
if (process.env.NODE_ENV === 'development') {
  console.log('[X Auth] X_CLIENT_ID exists:', !!X_CLIENT_ID);
  console.log('[X Auth] X_CLIENT_ID length:', X_CLIENT_ID.length);
  console.log('[X Auth] X_REDIRECT_URI:', X_REDIRECT_URI);
}

// Generate PKCE code verifier and challenge
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

// Initiate X OAuth flow
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    if (!X_CLIENT_ID) {
      return NextResponse.json({ 
        error: 'X OAuth not configured. Please set X_CLIENT_ID in environment variables.' 
      }, { status: 503 });
    }

    // Generate PKCE
    const { verifier, challenge } = generatePKCE();

    // Generate state with wallet address for security
    const state = Buffer.from(JSON.stringify({
      walletAddress,
      nonce: crypto.randomBytes(16).toString('hex'),
    })).toString('base64url');

    // Build X OAuth URL
    const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', X_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', X_REDIRECT_URI);
    authUrl.searchParams.set('scope', 'tweet.read users.read offline.access');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
      codeVerifier: verifier, // Frontend stores this for callback
      state,
    });
  } catch (error: any) {
    console.error('[X Auth] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

