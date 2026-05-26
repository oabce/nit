const db = require('../db');

const STATUS = {
  PENDENTE: 0,
  APROVADO: 1,
  RECUSADO: 2,
  DESATIVADO: 3,
};

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

function handleServerError(res, scope, err) {
  const detail = err.sqlMessage || err.message || 'Erro interno no servidor.';
  console.error(`[${scope}]`, detail);
  json(res, 500, { error: detail });
}

function cleanValue(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function buildProfileWhere(perfil) {
  if (perfil === 'advogado') {
    return "numero_oab IS NOT NULL AND numero_oab <> ''";
  }

  if (perfil === 'colaborador') {
    return "(numero_oab IS NULL OR numero_oab = '')";
  }

  return null;
}

function getLoginField(perfil, body) {
  if (perfil === 'advogado') {
    const oab = cleanValue(body.oab);
    const email = cleanValue(body.email);
    return {
      value: oab ?? email,
      fieldName: 'Numero OAB ou e-mail',
    };
  }

  if (perfil === 'colaborador') {
    const usuario = cleanValue(body.usuario);
    const email = cleanValue(body.email);
    return {
      value: usuario ?? email,
      fieldName: 'Usuario ou e-mail',
    };
  }

  return { value: null, fieldName: 'Identificador' };
}

function statusToText(status) {
  if (status === STATUS.PENDENTE) return 'pendente';
  if (status === STATUS.APROVADO) return 'aprovado';
  if (status === STATUS.RECUSADO) return 'recusado';
  if (status === STATUS.DESATIVADO) return 'desativado';
  return 'desconhecido';
}

function getBlockedStatusMessage(status) {
  if (status === STATUS.PENDENTE) {
    return 'Sua solicitacao ainda esta pendente de aprovacao.';
  }

  if (status === STATUS.RECUSADO) {
    return 'Sua solicitacao de acesso foi recusada. Procure o administrador.';
  }

  if (status === STATUS.DESATIVADO) {
    return 'Seu cadastro esta desativado. Procure o administrador.';
  }

  return null;
}

function getExistingRegisterMessage(fieldLabel, status) {
  if (status === STATUS.PENDENTE) {
    return `Ja existe uma solicitacao pendente para este ${fieldLabel}.`;
  }

  if (status === STATUS.RECUSADO) {
    return `Este ${fieldLabel} ja possui uma solicitacao recusada. Procure o administrador.`;
  }

  if (status === STATUS.DESATIVADO) {
    return `Este ${fieldLabel} pertence a um cadastro desativado. Procure o administrador para reativacao.`;
  }

  return null;
}

function mapUserRow(row) {
  return {
    id: row.id,
    nome: row.nome,
    perfil: row.oab ? 'advogado' : 'colaborador',
    oab: row.oab,
    cpf: row.cpf,
    email: row.email,
    usuario: row.usuario,
    status: statusToText(row.ativo),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

async function findUserByLogin(perfil, loginValue, includePassword, senha) {
  const profileWhere = buildProfileWhere(perfil);

  if (!profileWhere) return null;

  const passwordFilter = includePassword ? 'AND senha_hash = SHA2(?, 256)' : '';

  const [rows] = await db.execute(
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
      WHERE (numero_oab = ? OR nome_usuario = ? OR email = ?)
        AND ${profileWhere}
        ${passwordFilter}
      ORDER BY atualizado_em DESC
      LIMIT 1`,
    includePassword
      ? [loginValue, loginValue, loginValue, senha]
      : [loginValue, loginValue, loginValue]
  );

  return rows[0] || null;
}

async function findUserById(userId) {
  const [rows] = await db.execute(
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
      WHERE id = ?
      LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function findUserByStatusLookup(perfil, email, cpf) {
  const profileWhere = buildProfileWhere(perfil);

  if (!profileWhere) return null;

  const [rows] = await db.execute(
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
      WHERE email = ?
        AND cpf = ?
        AND ${profileWhere}
      LIMIT 1`,
    [email, cpf]
  );

  return rows[0] || null;
}

async function ensureUnique(field, value, label, res) {
  if (!value) return true;

  const [rows] = await db.execute(
    `SELECT id, ativo
       FROM usuarios
      WHERE ${field} = ?
      LIMIT 1`,
    [value]
  );

  if (rows.length === 0) return true;

  const existingMessage = getExistingRegisterMessage(label, rows[0].ativo);

  if (existingMessage) {
    json(res, 409, { error: existingMessage });
    return false;
  }

  json(res, 409, { error: `${label.charAt(0).toUpperCase()}${label.slice(1)} ja cadastrado.` });
  return false;
}

async function login(req, res) {
  try {
    const body = await readBody(req);
    const perfil = cleanValue(body.perfil);
    const senha = cleanValue(body.senha);

    if (!perfil || !senha) {
      return json(res, 400, { error: 'Campos obrigatorios nao informados.' });
    }

    const loginField = getLoginField(perfil, body);

    if (!loginField.value) {
      return json(res, 400, { error: `${loginField.fieldName} nao informado.` });
    }

    const user = await findUserByLogin(perfil, loginField.value, true, senha);
    const blockedMessage = getBlockedStatusMessage(user?.ativo);

    if (blockedMessage) {
      return json(res, 403, { error: blockedMessage });
    }

    if (user?.ativo === STATUS.APROVADO) {
      return json(res, 200, { success: true, usuario: user });
    }

    const existingUser = await findUserByLogin(perfil, loginField.value, false);
    const existingBlockedMessage = getBlockedStatusMessage(existingUser?.ativo);

    if (existingBlockedMessage) {
      return json(res, 403, { error: existingBlockedMessage });
    }

    return json(res, 401, { error: 'Credenciais incorretas.' });
  } catch (err) {
    handleServerError(res, 'auth/login', err);
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

    if (!(await ensureUnique('email', email, 'e-mail', res))) return;
    if (!(await ensureUnique('numero_oab', oab, 'numero OAB', res))) return;
    if (!(await ensureUnique('nome_usuario', usuario, 'usuario', res))) return;

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
       ) VALUES (?, ?, ?, ?, ?, SHA2(?, 256), ?, NOW(), NOW())`,
      [
        nome,
        perfil === 'advogado' ? oab : null,
        cpf,
        email,
        perfil === 'colaborador' ? usuario : null,
        senha,
        STATUS.PENDENTE,
      ]
    );

    json(res, 201, {
      success: true,
      message: 'Solicitacao enviada com sucesso. Aguarde a aprovacao do administrador.',
    });
  } catch (err) {
    handleServerError(res, 'auth/register', err);
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

    const profileWhere = buildProfileWhere(perfil);

    if (!profileWhere) {
      return json(res, 400, { error: 'Perfil invalido.' });
    }

    const [rows] = await db.execute(
      `SELECT id, ativo
         FROM usuarios
        WHERE email = ?
          AND ${profileWhere}
        LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return json(res, 404, { error: 'Nenhum usuario encontrado com esse e-mail para o perfil selecionado.' });
    }

    const blockedMessage = getBlockedStatusMessage(rows[0].ativo);
    if (blockedMessage) {
      return json(res, 403, { error: blockedMessage });
    }

    json(res, 200, {
      success: true,
      message: 'Solicitacao recebida. Procure o administrador do sistema para redefinir sua senha.',
    });
  } catch (err) {
    handleServerError(res, 'auth/forgot-password', err);
  }
}

async function getAccessRequestStatus(req, res) {
  try {
    const body = await readBody(req);
    const perfil = cleanValue(body.perfil);
    const email = cleanValue(body.email);
    const cpf = cleanValue(body.cpf);

    if (!perfil || !email || !cpf) {
      return json(res, 400, { error: 'Perfil, e-mail e CPF sao obrigatorios.' });
    }

    const user = await findUserByStatusLookup(perfil, email, cpf);

    if (!user) {
      return json(res, 404, { error: 'Nenhuma solicitacao encontrada com os dados informados.' });
    }

    let orientacao = 'Sua solicitacao esta em analise pela equipe administradora.';

    if (user.ativo === STATUS.APROVADO) {
      orientacao = 'Sua solicitacao foi aprovada. Voce ja pode acessar o sistema com suas credenciais.';
    } else if (user.ativo === STATUS.RECUSADO) {
      orientacao = 'Sua solicitacao foi recusada. Procure o administrador para entender os proximos passos.';
    } else if (user.ativo === STATUS.DESATIVADO) {
      orientacao = 'Seu cadastro esta desativado. Procure o administrador para solicitar reativacao.';
    }

    return json(res, 200, {
      success: true,
      solicitacao: {
        ...mapUserRow(user),
        orientacao,
      },
    });
  } catch (err) {
    handleServerError(res, 'auth/request-status', err);
  }
}

async function listAccessRequests(req, res) {
  try {
    const [pendingRows] = await db.execute(
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
        WHERE ativo = ?
        ORDER BY criado_em ASC`,
      [STATUS.PENDENTE]
    );

    const [activeRows] = await db.execute(
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
        WHERE ativo = ?
        ORDER BY atualizado_em DESC, nome_completo ASC`,
      [STATUS.APROVADO]
    );

    const [summaryRows] = await db.execute(
      `SELECT ativo, COUNT(*) AS total
         FROM usuarios
        GROUP BY ativo`
    );

    const resumo = {
      pendentes: 0,
      ativos: 0,
      recusados: 0,
      desativados: 0,
    };

    summaryRows.forEach((row) => {
      if (row.ativo === STATUS.PENDENTE) resumo.pendentes = row.total;
      if (row.ativo === STATUS.APROVADO) resumo.ativos = row.total;
      if (row.ativo === STATUS.RECUSADO) resumo.recusados = row.total;
      if (row.ativo === STATUS.DESATIVADO) resumo.desativados = row.total;
    });

    json(res, 200, {
      resumo,
      solicitacoes: pendingRows.map(mapUserRow),
      usuariosAtivos: activeRows.map(mapUserRow),
    });
  } catch (err) {
    handleServerError(res, 'admin/access-requests', err);
  }
}

async function updatePendingRequestStatus(res, userId, nextStatus) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return json(res, 400, { error: 'Identificador da solicitacao invalido.' });
  }

  const request = await findUserById(userId);

  if (!request) {
    return json(res, 404, { error: 'Solicitacao nao encontrada.' });
  }

  if (request.ativo === nextStatus) {
    return json(res, 200, {
      success: true,
      message: nextStatus === STATUS.APROVADO ? 'Solicitacao ja estava aprovada.' : 'Solicitacao ja estava recusada.',
      solicitacao: mapUserRow(request),
    });
  }

  if (request.ativo !== STATUS.PENDENTE) {
    return json(res, 409, { error: 'Apenas solicitacoes pendentes podem ser revisadas.' });
  }

  await db.execute(
    `UPDATE usuarios
        SET ativo = ?,
            atualizado_em = NOW()
      WHERE id = ?`,
    [nextStatus, userId]
  );

  const updatedRequest = await findUserById(userId);

  return json(res, 200, {
    success: true,
    message: nextStatus === STATUS.APROVADO
      ? 'Solicitacao aprovada com sucesso.'
      : 'Solicitacao recusada com sucesso.',
    solicitacao: mapUserRow(updatedRequest),
  });
}

async function approveAccessRequest(req, res, userId) {
  try {
    return await updatePendingRequestStatus(res, userId, STATUS.APROVADO);
  } catch (err) {
    handleServerError(res, 'admin/access-requests/approve', err);
  }
}

async function rejectAccessRequest(req, res, userId) {
  try {
    return await updatePendingRequestStatus(res, userId, STATUS.RECUSADO);
  } catch (err) {
    handleServerError(res, 'admin/access-requests/reject', err);
  }
}

async function deactivateUserAccount(req, res, userId) {
  try {
    if (!Number.isInteger(userId) || userId <= 0) {
      return json(res, 400, { error: 'Identificador do usuario invalido.' });
    }

    const user = await findUserById(userId);

    if (!user) {
      return json(res, 404, { error: 'Usuario nao encontrado.' });
    }

    if (user.ativo === STATUS.DESATIVADO) {
      return json(res, 200, {
        success: true,
        message: 'Cadastro ja estava desativado.',
        solicitacao: mapUserRow(user),
      });
    }

    if (user.ativo !== STATUS.APROVADO) {
      return json(res, 409, { error: 'Apenas usuarios ativos podem ser desativados.' });
    }

    await db.execute(
      `UPDATE usuarios
          SET ativo = ?,
              atualizado_em = NOW()
        WHERE id = ?`,
      [STATUS.DESATIVADO, userId]
    );

    const updatedUser = await findUserById(userId);

    return json(res, 200, {
      success: true,
      message: 'Cadastro desativado com sucesso.',
      solicitacao: mapUserRow(updatedUser),
    });
  } catch (err) {
    handleServerError(res, 'admin/access-requests/deactivate', err);
  }
}

module.exports = {
  login,
  register,
  forgotPassword,
  getAccessRequestStatus,
  listAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  deactivateUserAccount,
};
