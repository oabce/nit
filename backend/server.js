const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT   = 3000;
const PUBLIC = path.join(__dirname, '../frontend/public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const LIVE_RELOAD_SCRIPT = `
<script>
  (function () {
    const es = new EventSource('/livereload');
    es.onmessage = () => location.reload();
    es.onerror   = () => { es.close(); setTimeout(() => location.reload(), 1000); };
  })();
</script>`;

let clients = [];

function broadcast() {
  clients.forEach(res => res.write('data: reload\n\n'));
}

fs.watch(PUBLIC, { recursive: true }, (_, filename) => {
  if (!filename) return;
  console.log(`  [live-reload] ${filename}`);
  broadcast();
});

const { login, register } = require('./api/auth');

const server = http.createServer((req, res) => {
  // ── API ──────────────────────────────────────────────────────
  if (req.url === '/api/auth/login'    && req.method === 'POST') return login(req, res);
  if (req.url === '/api/auth/register' && req.method === 'POST') return register(req, res);

  if (req.url.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
    return;
  }

  // ── Live-reload ───────────────────────────────────────────────
  if (req.url === '/livereload') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(':\n\n');
    clients.push(res);
    req.on('close', () => { clients = clients.filter(c => c !== res); });
    return;
  }

  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/login.html';

  const filePath = path.join(PUBLIC, urlPath);

  // Impede path traversal fora de PUBLIC
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 – Arquivo não encontrado');
      return;
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mime });

    if (ext === '.html') {
      res.end(data.toString().replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`));
    } else {
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n  Servidor rodando em http://localhost:${PORT}`);
  console.log('  Live-reload ativo\n');
});
