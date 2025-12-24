import { NextRequest, NextResponse } from 'next/server';

// Twitter OAuth 2.0 callback handler
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const walletAddress = state; // We pass wallet address as state

    if (!code || !walletAddress) {
      return NextResponse.redirect(new URL('/settings?error=oauth_failed', request.url));
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.NEXT_PUBLIC_API_URL || 'https://www.memeetf.tech'}/api/auth/twitter`,
        code_verifier: process.env.TWITTER_CODE_VERIFIER || '',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Twitter token exchange failed:', await tokenResponse.text());
      return NextResponse.redirect(new URL('/settings?error=token_exchange_failed', request.url));
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch user info from Twitter
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=username', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      return NextResponse.redirect(new URL('/settings?error=user_fetch_failed', request.url));
    }

    const userData = await userResponse.json();
    const twitterUsername = userData.data?.username;

    if (!twitterUsername) {
      return NextResponse.redirect(new URL('/settings?error=no_username', request.url));
    }

    // Update user in database
    const updateResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://www.memeetf.tech'}/api/users/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        xUsername: twitterUsername,
      }),
    });

    if (updateResponse.ok) {
      return NextResponse.redirect(new URL('/settings?success=twitter_connected', request.url));
    } else {
      return NextResponse.redirect(new URL('/settings?error=db_update_failed', request.url));
    }
  } catch (error) {
    console.error('Twitter OAuth error:', error);
    return NextResponse.redirect(new URL('/settings?error=oauth_error', request.url));
  }
}

