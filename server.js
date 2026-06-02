const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

// Enable CORS for all requests so our static frontend can query the API
app.use(cors());

// Support parsing JSON and raw text bodies
app.use(express.json({ limit: '15mb' }));
app.use(express.text({ type: '*/*', limit: '15mb' }));

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'))
    ? false 
    : { rejectUnauthorized: false }
});

// Create tables on start
async function initDb() {
  try {
    const client = await pool.connect();
    console.log("Connected to PostgreSQL successfully!");
    
    // Create the key-value store table
    await client.query(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    client.release();
    console.log("Database table initialized successfully.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}

initDb();

// Routes

// 1. GET key value
app.get('/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const result = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
    if (result.rows.length === 0) {
      return res.status(404).send('Key not found');
    }
    
    const val = result.rows[0].value;
    res.setHeader('Content-Type', 'application/json');
    res.send(val);
  } catch (err) {
    console.error(`Error retrieving key ${key}:`, err);
    res.status(500).send('Internal Server Error');
  }
});

// 2. POST (Upsert) key value
app.post('/:key', async (req, res) => {
  const { key } = req.params;
  let bodyValue = req.body;
  
  if (typeof bodyValue === 'object') {
    bodyValue = JSON.stringify(bodyValue);
  }
  
  try {
    await pool.query(
      `INSERT INTO kv_store (key, value, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP) 
       ON CONFLICT (key) 
       DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [key, bodyValue]
    );
    res.send('OK');
  } catch (err) {
    console.error(`Error saving key ${key}:`, err);
    res.status(500).send('Internal Server Error');
  }
});

// 3. Health check route
app.get('/', (req, res) => {
  res.send('VOLK 1303 Database Backend Server is active!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
