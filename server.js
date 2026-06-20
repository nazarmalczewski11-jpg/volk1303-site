const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 10000;

// Enable CORS for all requests so our static frontend can query the API
app.use(cors());

// Support parsing JSON and raw text bodies
app.use(express.json({ limit: '15mb' }));
app.use(express.text({ type: '*/*', limit: '15mb' }));

// Determine database mode
const usePostgres = !!process.env.DATABASE_URL;
let pool = null;
const JSON_DB_PATH = path.join(__dirname, 'kv_store.json');

// Initialize database
if (usePostgres) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
      ? false 
      : { rejectUnauthorized: false }
  });
  
  async function initDb() {
    try {
      const client = await pool.connect();
      console.log("Connected to PostgreSQL successfully!");
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
      console.error("Database initialization error, falling back to JSON:", err);
    }
  }
  initDb();
} else {
  console.log("No DATABASE_URL provided. Operating in LOCAL JSON mode.");
  console.log(`Data will be saved in: ${JSON_DB_PATH}`);
  if (!fs.existsSync(JSON_DB_PATH)) {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify({}, null, 2), 'utf-8');
  }
}

// Helpers for JSON DB
function readJsonDb() {
  try {
    if (!fs.existsSync(JSON_DB_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(JSON_DB_PATH, 'utf-8');
    const db = JSON.parse(raw);
    
    // Auto-initialize quests if key is completely missing
    if (db.quests === undefined || db.quests === null) {
      const defaultQuests = [
        {
          id: "first_bet",
          title: "Перша кров",
          description: "Зроби свою першу ставку на сайті",
          reward: 100,
          targetCount: 1,
          type: "bets"
        },
        {
          id: "five_wins",
          title: "Капер-Початківець",
          description: "Виграй 5 ставок на сайті",
          reward: 250,
          targetCount: 5,
          type: "wins"
        },
        {
          id: "tour_win",
          title: "Аналітик Мейджору",
          description: "Вгадай переможця турніру",
          reward: 500,
          targetCount: 1,
          type: "tour_win"
        },
        {
          id: "king_vcoin",
          title: "Король Vcoin",
          description: "Накопич 5000 монет на балансі",
          reward: 1000,
          targetCount: 5000,
          type: "balance"
        }
      ];
      db.quests = JSON.stringify(defaultQuests);
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
    }
    
    return db;
  } catch (e) {
    console.error("Error reading JSON database:", e);
    return {};
  }
}

function writeJsonDb(data) {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error("Error writing JSON database:", e);
  }
}

// Serve static frontend files
app.use(express.static(__dirname));

// Routes

// 1. GET key value
const handleGetKey = async (req, res) => {
  const { key } = req.params;
  
  if (usePostgres) {
    try {
      const result = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
      if (result.rows.length === 0) {
        return res.status(404).send('Key not found');
      }
      const val = result.rows[0].value;
      res.setHeader('Content-Type', 'application/json');
      res.send(val);
    } catch (err) {
      console.error(`Error retrieving key ${key} from Postgres:`, err);
      res.status(500).send('Internal Server Error');
    }
  } else {
    // JSON Mode
    const db = readJsonDb();
    if (db[key] === undefined) {
      return res.status(404).send('Key not found');
    }
    res.setHeader('Content-Type', 'application/json');
    res.send(db[key]);
  }
};

// 2. POST (Upsert) key value
const handlePostKey = async (req, res) => {
  const { key } = req.params;
  let bodyValue = req.body;
  
  if (typeof bodyValue === 'object') {
    bodyValue = JSON.stringify(bodyValue);
  }
  
  if (usePostgres) {
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
      console.error(`Error saving key ${key} to Postgres:`, err);
      res.status(500).send('Internal Server Error');
    }
  } else {
    // JSON Mode
    const db = readJsonDb();
    db[key] = bodyValue;
    writeJsonDb(db);
    res.send('OK');
  }
};

app.get('/api/:key', handleGetKey);
app.get('/:key', handleGetKey);

app.post('/api/:key', handlePostKey);
app.post('/:key', handlePostKey);

// 3. Health check route
app.get('/', (req, res) => {
  const mode = usePostgres ? 'PostgreSQL' : 'Local JSON File';
  res.send(`VOLK 1303 Database Backend Server is active! (Mode: ${mode})`);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port} in ${usePostgres ? 'PostgreSQL' : 'Local JSON'} mode`);
});

