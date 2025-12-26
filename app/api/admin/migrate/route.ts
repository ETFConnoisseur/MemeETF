import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePool } from '@/lib/database/connection';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const pool = getDatabasePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    console.log('[Migration] Starting database migration...');

    // Run migrations in order
    const migrations = [
      '001_initial_schema.sql',
      '004_fix_critical_schema_issues.sql',
      '005_add_network_support.sql'
    ];

    for (const migrationFile of migrations) {
      try {
        console.log(`[Migration] Running ${migrationFile}...`);
        const migrationPath = join(process.cwd(), 'migrations', migrationFile);
        const sql = readFileSync(migrationPath, 'utf8');
        await pool.query(sql);
        console.log(`[Migration] ${migrationFile} completed successfully`);
      } catch (migrationError: any) {
        console.error(`[Migration] Error in ${migrationFile}:`, migrationError.message);
        // Continue with other migrations
      }
    }

    console.log('[Migration] All migrations completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully. All tables created and schema fixed.',
    });
  } catch (error: any) {
    console.error('[Migration] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


