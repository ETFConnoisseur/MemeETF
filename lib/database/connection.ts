import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDatabasePool(): Pool | null {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    
    // Log environment variable status (without sensitive data)
    console.log('[DB] Environment check:', {
      hasDATABASE_URL: !!connectionString,
      hasPGHOST: !!process.env.PGHOST,
      hasPGUSER: !!process.env.PGUSER,
      hasPGDATABASE: !!process.env.PGDATABASE,
      hasPGPASSWORD: !!process.env.PGPASSWORD,
      NODE_ENV: process.env.NODE_ENV,
    });
    
    const config: any = {
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000, // Increased timeout
      max: 20, // Connection pool size
    };

    if (connectionString) {
      console.log('[DB] Using DATABASE_URL connection string');
      config.connectionString = connectionString;
    } else {
      // Fallback to individual variables
      if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
        console.log('[DB] Using individual PG environment variables');
        config.host = process.env.PGHOST;
        config.port = parseInt(process.env.PGPORT || '5432');
        config.user = process.env.PGUSER;
        config.password = process.env.PGPASSWORD;
        config.database = process.env.PGDATABASE;
        // Force SSL in production for most cloud databases
        if (process.env.NODE_ENV === 'production') {
          config.ssl = { rejectUnauthorized: false };
        }
      } else {
         console.error('[DB] CRITICAL: Database configuration missing.');
         console.error('[DB] DATABASE_URL:', connectionString ? 'SET' : 'NOT SET');
         console.error('[DB] PGHOST:', process.env.PGHOST || 'NOT SET');
         console.error('[DB] PGUSER:', process.env.PGUSER || 'NOT SET');
         console.error('[DB] PGDATABASE:', process.env.PGDATABASE || 'NOT SET');
         console.error('[DB] PGPASSWORD:', process.env.PGPASSWORD ? 'SET (hidden)' : 'NOT SET');
         return null;
      }
    }

    try {
      pool = new Pool(config);

      pool.on('error', (err) => {
        console.error('[DB] Unexpected error on idle client', err);
      });
      
      // Test connection immediately
      pool.connect().then(client => {
        console.log('[DB] Successfully connected to Postgres database');
        client.release();
      }).catch(err => {
        console.error('[DB] Failed to connect to Postgres database:', err.message);
        console.error('[DB] Connection config:', { host: config.host, port: config.port, user: config.user, database: config.database }); // Don't log password
      });

    } catch (error) {
      console.error('[DB] Failed to initialize database pool:', error);
      return null;
    }
  }

  return pool;
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
