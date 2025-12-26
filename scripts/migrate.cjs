const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('Starting migration...');

  const config = {
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  };

  // Check if individual variables are sufficient
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
    config.host = process.env.PGHOST;
    config.port = parseInt(process.env.PGPORT || '5432');
    config.user = process.env.PGUSER;
    
    // IMPORTANT: .env parsing can result in empty strings if not quoted properly or just empty
    const envPass = process.env.PGPASSWORD;
    if (typeof envPass === 'string') {
        config.password = envPass;
    } else {
        // Fallback or explicit check
        config.password = ''; 
    }

    // Fix for SASL error: empty string might be treated weirdly if SCRAM is used but password is empty
    // But error says "must be a string". 
    // Let's hardcode a check:
    if (config.password === '') {
        console.log('Warning: Password is empty string.');
    }
    
    config.database = process.env.PGDATABASE;
  } else if (process.env.DATABASE_URL) {
    config.connectionString = process.env.DATABASE_URL;
  } else {
    console.error('CRITICAL: Database configuration missing or password empty.');
    console.error('Please set PGPASSWORD in .env to a non-empty string, or provide a complete DATABASE_URL.');
    process.exit(1);
  }

  const pool = new Pool(config);

  // If password is still an issue, it might be the underlying lib or a conflict.
  // Let's print one last debug line before connect.
  // Actually, 'pg' lib shouldn't fail with "client password must be a string" if it IS a string (even empty).
  // Unless it's being passed as null/undefined somewhere internally or overridden.
  
  try {
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      if (err.code === '3D000') { // Database does not exist
        console.log(`Database '${config.database}' does not exist. Creating it...`);
        // Connect to 'postgres' to create the database
        const adminConfig = { ...config, database: 'postgres' };
        // Remove connectionString if present to avoid conflict, relying on individual props for admin connection
        // or parse connectionString to replace DB. Simplest is to assume standard params if connectionString used.
        // For robustness, let's just use a new Pool with modified config.
        if (adminConfig.connectionString) {
           adminConfig.connectionString = adminConfig.connectionString.replace(/\/[^/?]+$/, '/postgres');
        }
        
        const adminPool = new Pool(adminConfig);
        const adminClient = await adminPool.connect();
        try {
          await adminClient.query(`CREATE DATABASE "${config.database}"`);
          console.log(`Database '${config.database}' created successfully.`);
        } finally {
          adminClient.release();
          await adminPool.end();
        }
        // Retry connection to the new DB
        client = await pool.connect();
      } else {
        throw err;
      }
    }
    
    console.log('Connected to database.');

    const migrationPath = path.join(__dirname, '..', 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration SQL...');
    await client.query(sql);
    
    console.log('Migration completed successfully.');
    client.release();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

