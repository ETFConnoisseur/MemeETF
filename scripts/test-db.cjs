/**
 * Database Connection Test Script
 * Run with: node --env-file=.env scripts/test-db.js
 */

const { Pool } = require('pg');

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...\n');

  // Check environment variables
  const hasConnectionString = !!process.env.DATABASE_URL;
  const hasIndividualVars = !!(process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE);

  if (!hasConnectionString && !hasIndividualVars) {
    console.error('❌ ERROR: No database configuration found.');
    console.error('   Please set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE in .env');
    process.exit(1);
  }

  console.log('📝 Configuration:');
  if (hasConnectionString) {
    console.log('   Using: DATABASE_URL');
    // Mask password in URL for display
    const maskedUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
    console.log(`   URL: ${maskedUrl}`);
  } else {
    console.log('   Using: Individual variables');
    console.log(`   Host: ${process.env.PGHOST}`);
    console.log(`   Port: ${process.env.PGPORT || '5432'}`);
    console.log(`   User: ${process.env.PGUSER}`);
    console.log(`   Database: ${process.env.PGDATABASE}`);
  }
  console.log('');

  const config = {
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  };

  if (hasConnectionString) {
    config.connectionString = process.env.DATABASE_URL;
  } else {
    config.host = process.env.PGHOST;
    config.port = parseInt(process.env.PGPORT || '5432');
    config.user = process.env.PGUSER;
    config.password = process.env.PGPASSWORD || '';
    config.database = process.env.PGDATABASE;
  }

  const pool = new Pool(config);

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to database successfully!\n');

    // Check if tables exist
    console.log('📊 Checking tables...');
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    const tablesResult = await client.query(tablesQuery);
    
    const expectedTables = ['users', 'wallets', 'etf_listings', 'portfolio', 'investments', 'transactions', 'fees'];
    const existingTables = tablesResult.rows.map(r => r.table_name);

    console.log('');
    for (const table of expectedTables) {
      const exists = existingTables.includes(table);
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
    }

    const missingTables = expectedTables.filter(t => !existingTables.includes(t));
    if (missingTables.length > 0) {
      console.log('\n⚠️  Missing tables. Run: npm run migrate');
    } else {
      console.log('\n✅ All required tables exist!');
    }

    // Show row counts
    console.log('\n📈 Table row counts:');
    for (const table of existingTables) {
      if (expectedTables.includes(table)) {
        const countResult = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`   ${table}: ${countResult.rows[0].count} rows`);
      }
    }

    client.release();
    console.log('\n✅ Database test completed successfully!');

  } catch (error) {
    console.error('\n❌ Database connection failed:');
    console.error(`   Error: ${error.message}`);
    
    if (error.code === '3D000') {
      console.error('\n   The database does not exist.');
      console.error('   Create it with: psql -U postgres -c "CREATE DATABASE mtf_platform;"');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n   Could not connect to PostgreSQL server.');
      console.error('   Make sure PostgreSQL is running.');
    } else if (error.code === '28P01') {
      console.error('\n   Authentication failed.');
      console.error('   Check your PGPASSWORD in .env');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testDatabaseConnection();

