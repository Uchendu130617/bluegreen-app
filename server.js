const http = require('http');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const ENVIRONMENT = process.env.ENVIRONMENT || 'UNKNOWN';
const SERVER_NAME = process.env.SERVER_NAME || 'unknown-server';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html');

  if (req.url === '/db-test') {
    try {
      const result = await pool.query(
        'SELECT COUNT(*)::int AS user_count, NOW() AS db_time FROM users'
      );

      res.writeHead(200);
      res.end(`
        <h1>Database Connection Test</h1>
        <p>Environment: ${ENVIRONMENT}</p>
        <p>Server: ${SERVER_NAME}</p>
        <p>Database: CONNECTED</p>
        <p>Users: ${result.rows[0].user_count}</p>
        <p>Database Time: ${result.rows[0].db_time}</p>
      `);
    } catch (error) {
      console.error('Database connection error:', error.message);

      res.writeHead(500);
      res.end(`
        <h1>Database Connection Test</h1>
        <p>Environment: ${ENVIRONMENT}</p>
        <p>Server: ${SERVER_NAME}</p>
        <p>Database: CONNECTION FAILED</p>
      `);
    }

    return;
  }

  res.writeHead(200);

  res.end(`
    <h1>Blue/Green Deployment Lab</h1>
    <p>Environment: ${ENVIRONMENT}</p>
    <p>Server: ${SERVER_NAME}</p>
    <p>Port: ${PORT}</p>
  `);
});

server.listen(PORT, HOST, () => {
  console.log(
    `Application running on port ${PORT} | Environment: ${ENVIRONMENT} | Server: ${SERVER_NAME}`
  );
});
