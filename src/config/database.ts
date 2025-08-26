import { Pool } from 'pg';

export const createDatabasePool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    statement_timeout: 30000, // Abort any statement that takes more than 30 seconds
    query_timeout: 30000, // Abort any query that takes more than 30 seconds
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });

  return pool;
};

export const testDatabaseConnection = async (pool: Pool): Promise<void> => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    console.log('Database connected successfully:', result.rows[0].current_time);
    client.release();
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
};
