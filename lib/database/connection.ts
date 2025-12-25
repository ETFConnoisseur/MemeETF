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
      // Always use SSL for Supabase and other cloud databases
      // rejectUnauthorized: false allows self-signed certificates (needed for Supabase)
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000, // Increased timeout
      max: 20, // Connection pool size
    };

    if (connectionString) {
      console.log('[DB] Using DATABASE_URL connection string');
      
      // Parse DATABASE_URL to extract components and build config manually
      // This ensures SSL config is properly applied
      try {
        const url = new URL(connectionString);
        config.host = url.hostname;
        config.port = parseInt(url.port || '5432');
        config.user = decodeURIComponent(url.username); // Decode username in case it's encoded
        config.password = decodeURIComponent(url.password); // Decode password in case it's encoded
        config.database = url.pathname.replace(/^\//, '').split('?')[0] || 'postgres'; // Remove query params from path
        
        // CRITICAL: Force SSL config to handle self-signed certificates
        // This is the only way to ensure rejectUnauthorized: false is respected
        config.ssl = { 
          rejectUnauthorized: false  // Allow self-signed certificates (Supabase uses these)
        };
        
        // Don't use connectionString - use individual config instead
        delete config.connectionString;
        
        console.log('[DB] Parsed DATABASE_URL into individual config');
        console.log('[DB] Connection config:', {
          host: config.host,
          port: config.port,
          user: config.user,
          database: config.database,
          ssl: 'enabled (rejectUnauthorized=false)',
          passwordLength: config.password ? config.password.length : 0
        });
      } catch (parseError: any) {
        console.error('[DB] Failed to parse DATABASE_URL:', parseError.message);
        // Fallback: use connection string but modify SSL mode
        console.warn('[DB] Could not parse DATABASE_URL, using as-is with SSL override');
        
        // Remove any existing sslmode to avoid conflicts
        let finalConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');
        
        // Use sslmode=prefer to allow our SSL config to take precedence
        const separator = finalConnectionString.includes('?') ? '&' : '?';
        finalConnectionString += separator + 'sslmode=prefer';
        
        config.connectionString = finalConnectionString;
        config.ssl = { rejectUnauthorized: false };
        
        console.log('[DB] SSL configured: rejectUnauthorized=false (for Supabase)');
      }
    } else {
      // Fallback to individual variables
      if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
        console.log('[DB] Using individual PG environment variables');
        
        // Check if PGHOST is localhost (won't work on Vercel)
        if (process.env.PGHOST === 'localhost' || process.env.PGHOST === '127.0.0.1') {
          console.error('[DB] CRITICAL: PGHOST is set to localhost/127.0.0.1');
          console.error('[DB] This will NOT work on Vercel. Use your actual Supabase host.');
          console.error('[DB] Get your host from: https://supabase.com/dashboard/project/ucvtpvrfzgkonqwtdmue/settings/database');
          return null;
        }
        
        config.host = process.env.PGHOST;
        config.port = parseInt(process.env.PGPORT || '5432');
        config.user = process.env.PGUSER;
        config.password = process.env.PGPASSWORD;
        config.database = process.env.PGDATABASE;
        
        // CRITICAL: Force SSL config to handle self-signed certificates
        // This must be set for Supabase connections
        config.ssl = { 
          rejectUnauthorized: false  // Allow self-signed certificates (Supabase uses these)
        };
        
        // Log connection details (without password)
        console.log('[DB] Connection config:', {
          host: config.host,
          port: config.port,
          user: config.user,
          database: config.database,
          ssl: 'enabled (rejectUnauthorized=false)'
        });
        
        // Warn if database name is wrong
        if (config.database !== 'postgres' && config.database !== 'defaultdb') {
          console.warn('[DB] ⚠️ WARNING: PGDATABASE is set to:', config.database);
          console.warn('[DB] Supabase uses "postgres" as the database name. Current value may cause connection issues.');
        }
      } else {
         console.error('[DB] CRITICAL: Database configuration missing.');
         console.error('[DB] DATABASE_URL:', connectionString ? 'SET' : 'NOT SET');
         console.error('[DB] PGHOST:', process.env.PGHOST || 'NOT SET');
         console.error('[DB] PGUSER:', process.env.PGUSER || 'NOT SET');
         console.error('[DB] PGDATABASE:', process.env.PGDATABASE || 'NOT SET');
         console.error('[DB] PGPASSWORD:', process.env.PGPASSWORD ? 'SET (hidden)' : 'NOT SET');
         console.error('[DB] NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
         return null;
      }
    }

    try {
      pool = new Pool(config);

      pool.on('error', (err) => {
        console.error('[DB] Unexpected error on idle client', err);
      });
      
      // Test connection immediately (but don't block - let queries handle errors)
      pool.connect().then(client => {
        console.log('[DB] ✅ Successfully connected to Postgres database');
        client.release();
      }).catch(err => {
        console.error('[DB] ❌ Failed to connect to Postgres database:', err.message);
        console.error('[DB] Error code:', err.code);
        console.error('[DB] Error name:', err.name);
        console.error('[DB] Full error:', JSON.stringify({
          message: err.message,
          code: err.code,
          name: err.name
        }, null, 2));
        console.error('[DB] Connection config:', { 
          host: config.host || 'from DATABASE_URL', 
          port: config.port || 'from DATABASE_URL', 
          user: config.user || 'from DATABASE_URL', 
          database: config.database || 'from DATABASE_URL',
          hasSSL: !!config.ssl,
          sslConfig: config.ssl
        });
        
        // Provide helpful error messages
        if (err.message?.includes('ECONNREFUSED') || err.message?.includes('127.0.0.1') || err.message?.includes('localhost')) {
          console.error('[DB] 🔴 ERROR: Trying to connect to localhost!');
          console.error('[DB] This means PGHOST is set to localhost or environment variables are missing.');
          console.error('[DB] Fix: Set DATABASE_URL or PGHOST to your actual Supabase host in Vercel.');
          console.error('[DB] Get connection string from: https://supabase.com/dashboard/project/ucvtpvrfzgkonqwtdmue/settings/database');
        }
        
        if (err.message?.includes('certificate') || err.message?.includes('SSL') || err.message?.includes('self-signed')) {
          console.error('[DB] 🔴 SSL Certificate Error');
          console.error('[DB] SSL is enabled with rejectUnauthorized=false. If this persists, the SSL config may not be applied correctly.');
        }
        
        if (err.message?.includes('password') || err.message?.includes('authentication')) {
          console.error('[DB] 🔴 Authentication Error');
          console.error('[DB] Check that password is correct and properly URL-encoded if it has special characters.');
        }
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
