import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Admin credentials - MUST be set in environment variables
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_CODE = process.env.ADMIN_CODE;

// Simple token generation (in production, use JWT or a proper session system)
function generateToken(password: string, code: string): string {
  const data = `${password}:${code}:${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * POST /api/admin/auth
 * Authenticate admin user with password and code
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password, code } = body;

    if (!password || !code) {
      return NextResponse.json(
        { error: 'Password and code are required' },
        { status: 400 }
      );
    }

    // Check if admin credentials are configured
    if (!ADMIN_PASSWORD || !ADMIN_CODE) {
      console.error('[Admin Auth] ADMIN_PASSWORD or ADMIN_CODE not set in environment');
      return NextResponse.json(
        { error: 'Admin access not configured' },
        { status: 500 }
      );
    }

    // Check credentials
    if (password !== ADMIN_PASSWORD || code !== ADMIN_CODE) {
      console.log('[Admin Auth] Failed login attempt');
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate session token
    const token = generateToken(password, code);

    console.log('[Admin Auth] Successful login');

    return NextResponse.json({
      success: true,
      token,
      expiresIn: 3600, // 1 hour
    });
  } catch (error: any) {
    console.error('[Admin Auth] Error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/auth
 * Verify admin token
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // For this simple implementation, we just check if a token exists
    // In production, you'd validate the token properly
    if (!token || token.length < 32) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
    });
  } catch (error: any) {
    console.error('[Admin Auth] Verify error:', error);
    return NextResponse.json(
      { error: 'Token verification failed' },
      { status: 500 }
    );
  }
}
