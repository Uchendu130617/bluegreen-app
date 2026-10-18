const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ENVIRONMENT = process.env.ENVIRONMENT || 'UNKNOWN';
const SERVER_NAME = process.env.SERVER_NAME || 'unknown-server';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000
});

pool.on('error', (error) => {
  console.error('Unexpected database pool error:', error.message);
});

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

function validPriority(value) {
  return ['low', 'medium', 'high'].includes(value);
}

function validStatus(value) {
  return ['pending', 'in_progress', 'completed'].includes(value);
}

function validDueDate(value) {
  if (value === null || value === '') return true;
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      application: 'Task Manager',
      environment: ENVIRONMENT,
      server: SERVER_NAME
    });
  }

  if (url.pathname === '/db-test' && req.method === 'GET') {
    try {
      await pool.query('SELECT 1');
      return sendJson(res, 200, {
        database: 'connected',
        environment: ENVIRONMENT,
        server: SERVER_NAME
      });
    } catch (error) {
      console.error('Database test failed:', error.message);
      return sendJson(res, 503, { error: 'Database unavailable' });
    }
  }

  if (url.pathname === '/api/tasks' && req.method === 'GET') {
    const status = url.searchParams.get('status');

    if (status && status !== 'all' && !validStatus(status)) {
      return sendJson(res, 400, { error: 'Invalid task status' });
    }

    const result = status && status !== 'all'
      ? await pool.query(
          'SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC',
          [status]
        )
      : await pool.query(
          'SELECT * FROM tasks ORDER BY created_at DESC'
        );

    return sendJson(res, 200, result.rows);
  }

  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    const data = await readJson(req);
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const description = typeof data.description === 'string'
      ? data.description.trim() : '';
    const priority = data.priority || 'medium';
    const dueDate = data.due_date || null;

    if (!title || title.length > 200) {
      return sendJson(res, 400, {
        error: 'Title is required and must be at most 200 characters'
      });
    }

    if (description.length > 10000) {
      return sendJson(res, 400, { error: 'Description is too long' });
    }

    if (!validPriority(priority)) {
      return sendJson(res, 400, { error: 'Invalid priority' });
    }

    if (!validDueDate(dueDate)) {
      return sendJson(res, 400, { error: 'Invalid due date' });
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, description, priority, due_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, description, priority, dueDate]
    );

    return sendJson(res, 201, result.rows[0]);
  }

  const match = url.pathname.match(/^\/api\/tasks\/(\d+)$/);

  if (match) {
    const id = match[1];

    if (req.method === 'PATCH') {
      const data = await readJson(req);
      const allowed = ['title', 'description', 'status', 'priority', 'due_date'];
      const updates = [];

      for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;

        let value = data[key];

        if (key === 'title') {
          if (typeof value !== 'string' ||
              !value.trim() || value.trim().length > 200) {
            return sendJson(res, 400, { error: 'Invalid task title' });
          }
          value = value.trim();
        }

        if (key === 'description') {
          if (typeof value !== 'string' || value.length > 10000) {
            return sendJson(res, 400, { error: 'Invalid description' });
          }
        }

        if (key === 'status' && !validStatus(value)) {
          return sendJson(res, 400, { error: 'Invalid task status' });
        }

        if (key === 'priority' && !validPriority(value)) {
          return sendJson(res, 400, { error: 'Invalid task priority' });
        }

        if (key === 'due_date') {
          if (!validDueDate(value)) {
            return sendJson(res, 400, { error: 'Invalid due date' });
          }
          if (value === '') value = null;
        }

        updates.push({ key, value });
      }

      if (updates.length === 0) {
        return sendJson(res, 400, { error: 'No valid fields provided' });
      }

      const values = updates.map((item) => item.value);
      const assignments = updates.map(
        (item, index) => `${item.key} = $${index + 1}`
      );

      values.push(id);

      const result = await pool.query(
        `UPDATE tasks
         SET ${assignments.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING *`,
        values
      );

      if (!result.rowCount) {
        return sendJson(res, 404, { error: 'Task not found' });
      }

      return sendJson(res, 200, result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const result = await pool.query(
        'DELETE FROM tasks WHERE id = $1 RETURNING id',
        [id]
      );

      if (!result.rowCount) {
        return sendJson(res, 404, { error: 'Task not found' });
      }

      return sendJson(res, 200, { deleted: true, id });
    }
  }

  return sendJson(res, 404, { error: 'API route not found' });
}

const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8']
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/') || url.pathname === '/db-test') {
      return await handleApi(req, res, url);
    }

    const file = staticFiles[url.pathname];

    if (file && req.method === 'GET') {
      const filePath = path.join(__dirname, 'public', file[0]);

      if (!fs.existsSync(filePath)) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Application interface is being prepared.');
      }

      res.writeHead(200, {
        'Content-Type': file[1],
        'X-Content-Type-Options': 'nosniff'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    return sendJson(res, 404, { error: 'Route not found' });
  } catch (error) {
    console.error('Request failed:', error.message);

    if (!res.headersSent) {
      const clientError = error.message === 'Invalid JSON' ||
        error.message === 'Request body too large';

      return sendJson(res, clientError ? 400 : 500, {
        error: clientError ? error.message : 'Request failed'
      });
    }

    res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `Task Manager running on port ${PORT} | Environment: ${ENVIRONMENT} | Server: ${SERVER_NAME}`
  );
});
