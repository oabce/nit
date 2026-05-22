// api/auth.js – Handlers de autenticação

const db = require('../db');

// ── Utilitário: lê body JSON da requisição ────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('JSON inválido')); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── Login ─────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { perfil, email, senha } = await readBody(req);

    if (!email || !senha || !perfil) {
      return json(res, 400, { error: 'Campos obrigatórios não informados.' });
    }

    if (!db) {
      return json(res, 503, { error: 'Banco de dados não configurado ainda.' });
    }

    const [rows] = await db.execute(
      `SELECT id, nome, email, perfil
       FROM usuarios
       WHERE email = ? AND senha = SHA2(?, 256) AND perfil = ?
       LIMIT 1`,
      [email, senha, perfil]
    );

    if (rows.length === 0) {
      return json(res, 401, { error: 'E-mail ou senha incorretos.' });
    }

    // TODO: gerar JWT ou sessão
    json(res, 200, { success: true, usuario: rows[0] });

  } catch (err) {
    console.error('[auth/login]', err.message);
    json(res, 500, { error: 'Erro interno no servidor.' });
  }
}

// ── Cadastro ──────────────────────────────────────────────────
async function register(req, res) {
  try {
    const body = await readBody(req);
    const { perfil, nome, email, senha, oab } = body;

    if (!perfil || !nome || !email || !senha) {
      return json(res, 400, { error: 'Campos obrigatórios não informados.' });
    }

    if (perfil === 'advogado' && !oab) {
      return json(res, 400, { error: 'Número OAB obrigatório para advogados.' });
    }

    if (!db) {
      return json(res, 503, { error: 'Banco de dados não configurado ainda.' });
    }

    const [existe] = await db.execute(
      'SELECT id FROM usuarios WHERE email = ? LIMIT 1',
      [email]
    );

    if (existe.length > 0) {
      return json(res, 409, { error: 'E-mail já cadastrado.' });
    }

    await db.execute(
      `INSERT INTO usuarios (nome, email, senha, perfil, oab, criado_em)
       VALUES (?, ?, SHA2(?, 256), ?, ?, NOW())`,
      [nome, email, senha, perfil, oab || null]
    );

    json(res, 201, { success: true });

  } catch (err) {
    console.error('[auth/register]', err.message);
    json(res, 500, { error: 'Erro interno no servidor.' });
  }
}

async function forgotPassword(req, res) {
  try {
    const { perfil, email } = await readBody(req);

    if (!perfil || !email) {
      return json(res, 400, { error: 'Perfil e e-mail sao obrigatorios.' });
    }

    if (!db) {
      return json(res, 503, { error: 'Banco de dados nao configurado ainda.' });
    }

    const [rows] = await db.execute(
      `SELECT id
       FROM usuarios
       WHERE email = ? AND perfil = ?
       LIMIT 1`,
      [email, perfil]
    );

    if (rows.length === 0) {
      return json(res, 404, { error: 'Nenhum usuario encontrado com esse e-mail para o perfil selecionado.' });
    }

    json(res, 200, {
      success: true,
      message: 'Solicitacao recebida. Procure o administrador do sistema para redefinir sua senha.',
    });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
    json(res, 500, { error: 'Erro interno no servidor.' });
  }
}

module.exports = { login, register, forgotPassword };
