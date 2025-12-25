import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';

export async function GET(request: NextRequest) {
  try {
    // Check environment variables
    const envCheck = {
      DATABASE_URL: process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET',
      PGHOST: process.env.PGHOST || 'NOT SET',
      PGPORT: process.env.PGPORT || 'NOT SET',
      PGUSER: process.env.PGUSER || 'NOT SET',
      PGDATABASE: process.env.PGDATABASE || 'NOT SET',
      PGPASSWORD: process.env.PGPASSWORD ? 'SET (hidden)' : 'NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT SET',
    };

    // Try to get database pool
    const pool = getDatabasePool();
    
    if (!pool) {
      return NextResponse.json({
        success: false,
        error: 'Database pool is null',
        envCheck,
        message: 'Database configuration is missing or invalid. Check environment variables.',
      }, { status: 503 });
    }

    // Try to query the database
    try {
      const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
      return NextResponse.json({
        success: true,
        message: 'Database connection successful',
        envCheck,
        database: {
          currentTime: result.rows[0].current_time,
          version: result.rows[0].pg_version.substring(0, 50) + '...',
        },
      });
    } catch (dbError: any) {
      console.error('[Test DB] Query error:', dbError);
      console.error('[Test DB] Error code:', dbError.code);
      console.error('[Test DB] Error details:', {
        message: dbError.message,
        code: dbError.code,
        name: dbError.name,
      });
      
      return NextResponse.json({
        success: false,
        error: 'Database query failed',
        envCheck,
        dbError: dbError.message,
        dbErrorCode: dbError.code,
        dbErrorName: dbError.name,
        message: 'Database pool exists but query failed. Check database credentials and network access.',
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      message: 'Failed to test database connection',
    }, { status: 500 });
  }
}


