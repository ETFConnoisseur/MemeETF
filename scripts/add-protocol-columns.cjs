const { Pool } = require('pg');

async function addProtocolColumns() {
  console.log('Adding protocol columns to users table...\n');

  const config = {
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  };

  if (process.env.DATABASE_URL) {
    config.connectionString = process.env.DATABASE_URL;
  } else if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
    config.host = process.env.PGHOST;
    config.port = parseInt(process.env.PGPORT || '5432');
    config.user = process.env.PGUSER;
    config.password = process.env.PGPASSWORD || '';
    config.database = process.env.PGDATABASE;
  } else {
    console.error('Database configuration missing');
    process.exit(1);
  }

  const pool = new Pool(config);

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database\n');

    console.log('Adding protocol_sol_balance column...');
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS protocol_sol_balance NUMERIC(20, 8) DEFAULT 0;
    `);
    console.log('✅ Added protocol_sol_balance column');

    console.log('Adding protocol_wallet_address column...');
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS protocol_wallet_address VARCHAR(44);
    `);
    console.log('✅ Added protocol_wallet_address column');

    console.log('\n✅ All protocol columns added successfully!');

    client.release();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addProtocolColumns();
