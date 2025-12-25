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
      connectionTimeoutMillis: 10000, // Increased timeout
      max: 20, // Connection pool size
    };
    
    // SSL config - MUST be set for Supabase
    // rejectUnauthorized: false allows self-signed certificates
    config.ssl = {
      rejectUnauthorized: false
    };

    if (connectionString) {
      console.log('[DB] Using DATABASE_URL connection string');
      
      // Parse DATABASE_URL to extract components and build config manually
      // This ensures SSL config is properly applied
      try {
        const url = new URL(connectionString);
        config.host = url.hostname;
        config.port = parseInt(url.port || '5432');
        
        // Handle username and password (may be in format "user:pass" or just "user")
        const userInfo = url.username ? decodeURIComponent(url.username) : '';
        const passwordFromUrl = url.password ? decodeURIComponent(url.password) : '';
        
        // If username contains colon, it might be "user:pass" format
        if (userInfo.includes(':') && !passwordFromUrl) {
          const parts = userInfo.split(':');
          config.user = parts[0];
          config.password = parts.slice(1).join(':'); // In case password has colons
        } else {
          config.user = userInfo;
          config.password = passwordFromUrl;
        }
        
        // Extract database name (remove leading slash and query params)
        config.database = url.pathname.replace(/^\//, '').split('?')[0] || 'postgres';
        
        // CRITICAL: Force SSL config to handle self-signed certificates
        // This MUST be set explicitly for Supabase
        // The pg library requires this to be set as an object, not just a boolean
        config.ssl = {
          rejectUnauthorized: false,  // Allow self-signed certificates (Supabase uses these)
          require: true  // Require SSL connection
        };
        
        // Don't use connectionString - use individual config instead
        // This ensures our SSL config is properly applied
        delete config.connectionString;
        
        console.log('[DB] Parsed DATABASE_URL into individual config');
        console.log('[DB] Connection config:', {
          host: config.host,
          port: config.port,
          user: config.user,
          database: config.database,
          ssl: 'enabled (rejectUnauthorized=false)',
          passwordLength: config.password ? config.password.length : 0,
          hasPassword: !!config.password
        });
      } catch (parseError: any) {
        console.error('[DB] Failed to parse DATABASE_URL:', parseError.message);
        console.error('[DB] Parse error details:', parseError);
        // Fallback: use connection string but modify SSL mode
        console.warn('[DB] Could not parse DATABASE_URL, using as-is with SSL override');
        
        // Remove any existing sslmode to avoid conflicts
        let finalConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');
        
        // Use sslmode=prefer to allow our SSL config to take precedence
        const separator = finalConnectionString.includes('?') ? '&' : '?';
        finalConnectionString += separator + 'sslmode=prefer';
        
        config.connectionString = finalConnectionString;
        // Even when using connection string, we MUST set SSL config explicitly
        config.ssl = {
          rejectUnauthorized: false,
          require: true
        };
        
        console.log('[DB] SSL configured: rejectUnauthorized=false, require=true (for Supabase)');
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
        // The pg library requires explicit SSL object configuration
        config.ssl = {
          rejectUnauthorized: false,  // Allow self-signed certificates (Supabase uses these)
          require: true  // Require SSL connection
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
      // Log final config before creating pool (without password)
      console.log('[DB] Creating pool with config:', {
        host: config.host || 'from connectionString',
        port: config.port || 'from connectionString',
        user: config.user || 'from connectionString',
        database: config.database || 'from connectionString',
        hasSSL: !!config.ssl,
        sslRejectUnauthorized: config.ssl?.rejectUnauthorized,
        connectionTimeout: config.connectionTimeoutMillis,
        maxConnections: config.max
      });
      
      pool = new Pool(config);

      pool.on('error', (err) => {
        console.error('[DB] Unexpected error on idle client', err);
        console.error('[DB] Pool error details:', {
          message: err.message,
          code: err.code,
          name: err.name
        });
      });
      
      // Test connection immediately (but don't block - let queries handle errors)
      pool.connect().then(client => {
        console.log('[DB] ✅ Successfully connected to Postgres database');
        console.log('[DB] Connection test query successful');
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
