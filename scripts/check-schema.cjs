const { Pool } = require('pg');

async function checkSchema() {
  console.log('Checking database schema...\n');

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

    // Check users table columns
    const columnsQuery = `
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `;

    const result = await client.query(columnsQuery);

    console.log('📊 Users table columns:');
    console.log('─'.repeat(80));
    result.rows.forEach(row => {
      console.log(`  ${row.column_name.padEnd(30)} ${row.data_type.padEnd(20)} ${row.is_nullable}`);
    });
    console.log('─'.repeat(80));

    // Check specifically for protocol_sol_balance
    const hasProtocolBalance = result.rows.some(row => row.column_name === 'protocol_sol_balance');
    const hasProtocolWallet = result.rows.some(row => row.column_name === 'protocol_wallet_address');

    console.log('');
    console.log(hasProtocolBalance ? '✅ protocol_sol_balance column exists' : '❌ protocol_sol_balance column MISSING');
    console.log(hasProtocolWallet ? '✅ protocol_wallet_address column exists' : '❌ protocol_wallet_address column MISSING');

    client.release();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkSchema();
