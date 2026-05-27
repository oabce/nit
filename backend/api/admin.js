'use strict';
// Arquivo legado: este modulo nao participa do fluxo atual do painel
// administrativo. As rotas ativas de revisao, aprovacao, recusa,
// desativacao e definicao de credenciais estao em backend/api/auth.js
// e sao conectadas por backend/server.js.
const db = require('../db');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('JSON invalido')); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function clean(v) {
  if (typeof v !== 'string') return v ?? null;
  const t = v.trim();
  return t === '' ? null : t;
}

async function isAdmin(adminId) {
  if (!adminId) return false;
  const [rows] = await db.execute(
    'SELECT id FROM usuarios WHERE id = ? AND adm = 1 AND ativo = 1 LIMIT 1',
    [adminId]
  );
  return rows.length > 0;
}

async function listPending(req, res) {
  try {
    const params = new URL('http://x' + req.url).searchParams;
    if (!(await isAdmin(params.get('adminId')))) return json(res, 403, { error: 'Acesso negado.' });

    const [rows] = await db.execute(
      `SELECT id, nome_completo AS nome, numero_oab AS oab, cpf, email,
              nome_usuario AS usuario, criado_em
         FROM usuarios WHERE ativo = 0 ORDER BY criado_em DESC`
    );
    json(res, 200, { success: true, pendentes: rows });
  } catch (err) {
    console.error('[admin/pending]', err.message);
    json(res, 500, { error: 'Erro interno.' });
  }
}

async function approveUser(req, res) {
  try {
    const body = await readBody(req);
    if (!(await isAdmin(body.adminId))) return json(res, 403, { error: 'Acesso negado.' });
    if (!body.userId) return json(res, 400, { error: 'userId obrigatorio.' });

    if (body.senha) {
      await db.execute(
        'UPDATE usuarios SET ativo = 1, senha_hash = SHA2(?, 256), atualizado_em = NOW() WHERE id = ? AND ativo = 0',
        [body.senha, body.userId]
      );
    } else {
      await db.execute(
        'UPDATE usuarios SET ativo = 1, atualizado_em = NOW() WHERE id = ? AND ativo = 0',
        [body.userId]
      );
    }
    json(res, 200, { success: true });
  } catch (err) {
    console.error('[admin/approve]', err.message);
    json(res, 500, { error: 'Erro interno.' });
  }
}

async function rejectUser(req, res) {
  try {
    const body = await readBody(req);
    if (!(await isAdmin(body.adminId))) return json(res, 403, { error: 'Acesso negado.' });
    if (!body.userId) return json(res, 400, { error: 'userId obrigatorio.' });

    await db.execute('DELETE FROM usuarios WHERE id = ? AND ativo = 0', [body.userId]);
    json(res, 200, { success: true });
  } catch (err) {
    console.error('[admin/reject]', err.message);
    json(res, 500, { error: 'Erro interno.' });
  }
}

async function editUser(req, res) {
  try {
    const body = await readBody(req);
    if (!(await isAdmin(body.adminId))) return json(res, 403, { error: 'Acesso negado.' });
    if (!body.userId) return json(res, 400, { error: 'userId obrigatorio.' });

    const nome = clean(body.nome);
    const email = clean(body.email);
    if (!nome || !email) return json(res, 400, { error: 'Nome e e-mail sao obrigatorios.' });

    if (body.senha) {
      await db.execute(
        `UPDATE usuarios SET nome_completo=?, email=?, cpf=?, numero_oab=?, nome_usuario=?,
          senha_hash=SHA2(?,256), atualizado_em=NOW() WHERE id=?`,
        [nome, email, clean(body.cpf), clean(body.oab), clean(body.usuario), body.senha, body.userId]
      );
    } else {
      await db.execute(
        `UPDATE usuarios SET nome_completo=?, email=?, cpf=?, numero_oab=?, nome_usuario=?,
          atualizado_em=NOW() WHERE id=?`,
        [nome, email, clean(body.cpf), clean(body.oab), clean(body.usuario), body.userId]
      );
    }
    json(res, 200, { success: true });
  } catch (err) {
    console.error('[admin/edit]', err.message);
    json(res, 500, { error: 'Erro interno.' });
  }
}

async function createUser(req, res) {
  try {
    const body = await readBody(req);
    if (!(await isAdmin(body.adminId))) return json(res, 403, { error: 'Acesso negado.' });

    const nome = clean(body.nome);
    const email = clean(body.email);
    const senha = clean(body.senha);
    const oab = clean(body.oab);
    const usuario = clean(body.usuario);
    const cpf = clean(body.cpf);

    if (!nome || !email || !senha) return json(res, 400, { error: 'Nome, e-mail e senha sao obrigatorios.' });

    const [emailExists] = await db.execute('SELECT id FROM usuarios WHERE email=? LIMIT 1', [email]);
    if (emailExists.length > 0) return json(res, 409, { error: 'E-mail ja cadastrado.' });

    if (oab) {
      const [oabExists] = await db.execute('SELECT id FROM usuarios WHERE numero_oab=? LIMIT 1', [oab]);
      if (oabExists.length > 0) return json(res, 409, { error: 'Numero OAB ja cadastrado.' });
    }

    if (usuario) {
      const [uExists] = await db.execute('SELECT id FROM usuarios WHERE nome_usuario=? LIMIT 1', [usuario]);
      if (uExists.length > 0) return json(res, 409, { error: 'Usuario ja cadastrado.' });
    }

    await db.execute(
      `INSERT INTO usuarios (nome_completo, numero_oab, cpf, email, nome_usuario, senha_hash, ativo, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, SHA2(?, 256), 1, NOW(), NOW())`,
      [nome, oab, cpf, email, usuario, senha]
    );
    json(res, 201, { success: true });
  } catch (err) {
    console.error('[admin/create]', err.message);
    json(res, 500, { error: 'Erro interno.' });
  }
}

module.exports = { listPending, approveUser, rejectUser, editUser, createUser };
