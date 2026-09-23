
const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });

  res.end(`
    <h1>Blue/Green Deployment Lab</h1>
    <p>Environment: BLUE</p>
    <p>Server: blue-server</p>
    <p>Port: ${PORT}</p>
  `);
});

server.listen(PORT, HOST, () => {
  console.log(`Application running on port ${PORT}`);
});
