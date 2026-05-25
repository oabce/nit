const crypto = require('crypto');
const db = require('../db');
const { sendResetEmail } = require('./mailer');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new Error('JSON invalido'));
      }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function cleanValue(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

async function login(req, res) {
  try {
    const body = await readBody(req);
    const perfil = cleanValue(body.perfil);
    const senha = cleanValue(body.senha);

    if (!perfil || !senha) {
      return json(res, 400, { error: 'Campos obrigatorios nao informados.' });
    }

    let rows;

    if (perfil === 'advogado') {
      const oab = cleanValue(body.oab);
      const email = cleanValue(body.email);
      const loginValue = oab ?? email;

      if (!loginValue) {
        return json(res, 400, { error: 'Numero OAB ou e-mail nao informado.' });
      }

      [rows] = await db.execute(
        `SELECT id,
                nome_completo AS nome,
                numero_oab AS oab,
                cpf,
                email,
                nome_usuario AS usuario,
                ativo,
                criado_em,
                atualizado_em
           FROM usuarios
          WHERE (numero_oab = ? OR email = ?)
            AND numero_oab IS NOT NULL
            AND numero_oab <> ''
            AND senha_hash = SHA2(?, 256)
            AND ativo = 1
          LIMIT 1`,
        [loginValue, loginValue, senha]
      );
    } else if (perfil === 'colaborador') {
      const usuario = cleanValue(body.usuario);
      const email = cleanValue(body.email);
      const loginValue = usuario ?? email;

      if (!loginValue) {
        return json(res, 400, { error: 'Usuario ou e-mail nao informado.' });
      }

      [rows] = await db.execute(
        `SELECT id,
                nome_completo AS nome,
                numero_oab AS oab,
                cpf,
                email,
                nome_usuario AS usuario,
                ativo,
                criado_em,
                atualizado_em
           FROM usuarios
          WHERE (nome_usuario = ? OR email = ?)
            AND (numero_oab IS NULL OR numero_oab = '')
            AND senha_hash = SHA2(?, 256)
            AND ativo = 1
          LIMIT 1`,
        [loginValue, loginValue, senha]
      );
    } else {
      return json(res, 400, { error: 'Perfil invalido.' });
    }

    if (rows.length === 0) {
      return json(res, 401, { error: 'Credenciais incorretas.' });
    }

    json(res, 200, { success: true, usuario: rows[0] });
  } catch (err) {
    console.error('[auth/login]', err.message);
    json(res, 500, { error: 'Erro interno no servidor.' });
  }
}

async function register(req, res) {
  try {
    const body = await readBody(req);
    const perfil = cleanValue(body.perfil);
    const nome = cleanValue(body.nome);
    const email = cleanValue(body.email);
    const senha = cleanValue(body.senha);
    const oab = cleanValue(body.oab);
    const cpf = cleanValue(body.cpf);
    const usuario = cleanValue(body.usuario);

    if (!perfil || !nome || !email || !senha) {
      return json(res, 400, { error: 'Campos obrigatorios nao informados.' });
    }

    if (perfil === 'advogado' && !oab) {
      return json(res, 400, { error: 'Numero OAB obrigatorio para advogados.' });
    }

    if (perfil === 'colaborador' && !usuario) {
      return json(res, 400, { error: 'Usuario obrigatorio para colaboradores.' });
    }

    const [emailExists] = await db.execute(
      'SELECT id FROM usuarios WHERE email = ? LIMIT 1',
      [email]
    );

    if (emailExists.length > 0) {
      return json(res, 409, { error: 'E-mail ja cadastrado.' });
    }

    if (oab) {
      const [oabExists] = await db.execute(
        'SELECT id FROM usuarios WHERE numero_oab = ? LIMIT 1',
        [oab]
      );

      if (oabExists.length > 0) {
        return json(res, 409, { error: 'Numero OAB ja cadastrado.' });
      }
    }

    if (usuario) {
      const [usuarioExists] = await db.execute(
        'SELECT id FROM usuarios WHERE nome_usuario = ? LIMIT 1',
        [usuario]
      );

      if (usuarioExists.length > 0) {
        return json(res, 409, { error: 'Usuario ja cadastrado.' });
      }
    }

    await db.execute(
      `INSERT INTO usuarios (
         nome_completo,
         numero_oab,
         cpf,
         email,
         nome_usuario,
         senha_hash,
         ativo,
         criado_em,
         atualizado_em
       ) VALUES (?, ?, ?, ?, ?, SHA2(?, 256), 1, NOW(), NOW())`,
      [
        nome,
        perfil === 'advogado' ? oab : null,
        cpf,
        email,
        perfil === 'colaborador' ? usuario : null,
        senha,
      ]
    );

    json(res, 201, { success: true });
  } catch (err) {
    console.error('[auth/register]', err.message);
    json(res, 500, { error: 'Erro interno no servidor.' });
  }
}

async function forgotPassword(req, res) {
  try {
    const body = await readBody(req);
    const perfil = cleanValue(body.perfil);
    const email = cleanValue(body.email);

    if (!perfil || !email) {
      return json(res, 400, { error: 'Perfil e e-mail sao obrigatorios.' });
    }

    let rows;

    if (perfil === 'advogado') {
      [rows] = await db.execute(
        `SELECT id FROM usuarios
          WHERE email = ? AND numero_oab IS NOT NULL AND numero_oab <> '' AND ativo = 1
          LIMIT 1`,
        [email]
      );
    } else if (perfil === 'colaborador') {
      [rows] = await db.execute(
        `SELECT id FROM usuarios
          WHERE email = ? AND (numero_oab IS NULL OR numero_oab = '') AND ativo = 1
          LIMIT 1`,
        [email]
      );
    } else {
      return json(res, 400, { error: 'Perfil invalido.' });
    }

    // Resposta genérica para não revelar se o e-mail existe
    if (rows.length === 0) {
      return json(res, 200, { success: true, message: 'Se o e-mail estiver cadastrado, voce recebera as instrucoes em breve.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await db.execute(
      `UPDATE usuarios SET reset_token = ?, reset_token_expires = ? WHERE id = ?`,
      [token, expires, rows[0].id]
    );

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetLink = `${appUrl}/reset-senha.html?token=${token}`;

    await sendResetEmail(email, resetLink);

    json(res, 200, { success: true, message: 'Se o e-mail estiver cadastrado, voce recebera as instrucoes em breve.' });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
    json(res, 500, { error: 'Erro interno no servidor.' });
  }
}

async function resetPassword(req, res) {
  try {
    const body = await readBody(req);
    const token = cleanValue(body.token);
    const senha = cleanValue(body.senha);

    if (!token || !senha) {
      return json(res, 400, { error: 'Token e nova senha sao obrigatorios.' });
    }

    const [rows] = await db.execute(
      `SELECT id FROM usuarios
        WHERE reset_token = ? AND reset_token_expires > NOW() AND ativo = 1
        LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      return json(res, 400, { error: 'Link invalido ou expirado. Solicite um novo.' });
    }

    await db.execute(
      `UPDATE usuarios SET senha_hash = SHA2(?, 256), reset_token = NULL, reset_token_expires = NULL WHERE id = ?`,
      [senha, rows[0].id]
    );

    json(res, 200, { success: true, message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    console.error('[auth/reset-password]', err.message);
    json(res, 500, { error: 'Erro interno no servidor.' });
  }
}

module.exports = { login, register, forgotPassword, resetPassword };
