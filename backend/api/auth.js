const crypto = require('crypto');
const db = require('../db');
const { sendResetEmail, sendApprovalEmail } = require('./mailer');
const envFile = require('../envFile');

const STATUS = {
  PENDENTE: 0,
  APROVADO: 1,
  RECUSADO: 2,
  DESATIVADO: 3,
};

// Lê o corpo bruto da requisição e converte para JSON.
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

// Envia uma resposta JSON padronizada.
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Centraliza logs e respostas de erro interno da API.
function handleServerError(res, scope, err) {
  const detail = err.sqlMessage || err.message || 'Erro interno no servidor.';
  console.error(`[${scope}]`, detail);
  json(res, 500, { error: detail });
}

// Remove espaços extras e normaliza strings vazias para null.
function cleanValue(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// Mantém apenas dígitos e opcionalmente limita o tamanho do valor.
function digitsOnly(value, maxLength = null) {
  if (typeof value !== 'string') return value ?? null;
  const normalized = value.replace(/\D/g, '');
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

// Monta o filtro SQL que separa advogados de colaboradores.
function buildProfileWhere(perfil) {
  if (perfil === 'advogado') {
    return "numero_oab IS NOT NULL AND numero_oab <> ''";
  }

  if (perfil === 'colaborador') {
    return "(numero_oab IS NULL OR numero_oab = '')";
  }

  return null;
}

// Define qual identificador deve ser usado no login conforme o perfil.
function getLoginField(perfil, body) {
  if (perfil === 'advogado') {
    const oab = digitsOnly(body.oab, 5);
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

// Traduz o status numérico do banco para texto legível na API.
function statusToText(status) {
  if (status === STATUS.PENDENTE) return 'pendente';
  if (status === STATUS.APROVADO) return 'aprovado';
  if (status === STATUS.RECUSADO) return 'recusado';
  if (status === STATUS.DESATIVADO) return 'desativado';
  return 'desconhecido';
}

// Retorna a mensagem de bloqueio adequada para status não autorizados.
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

// Gera a mensagem correta quando um cadastro duplicado já existe.
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

// Converte a linha do banco no formato esperado pelo frontend.
function mapUserRow(row) {
  return {
    id: row.id,
    nome: row.nome,
    perfil: row.oab ? 'advogado' : 'colaborador',
    oab: row.oab,
    cpf: row.cpf,
    email: row.email,
    usuario: row.usuario,
    adm: Boolean(row.adm),
    status: statusToText(row.ativo),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

// Identifica se o cadastro pertence a um colaborador.
function isCollaboratorRow(row) {
  return !row.oab;
}

// Lê o identificador do administrador enviado nas chamadas protegidas.
function getAdminUserId(req) {
  const headerValue = req.headers['x-admin-user-id'];
  const adminUserId = Number.parseInt(Array.isArray(headerValue) ? headerValue[0] : headerValue, 10);
  return Number.isInteger(adminUserId) && adminUserId > 0 ? adminUserId : null;
}

// Confirma no banco se o usuário autenticado possui permissão administrativa.
async function ensureAdmin(req, res) {
  const adminUserId = getAdminUserId(req);

  if (!adminUserId) {
    json(res, 401, { error: 'Sessao administrativa nao identificada.' });
    return null;
  }

  const [rows] = await db.execute(
    `SELECT id
       FROM users
      WHERE id = ?
        AND adm = 1
        AND ativo = ?
      LIMIT 1`,
    [adminUserId, STATUS.APROVADO]
  );

  if (rows.length === 0) {
    json(res, 403, { error: 'Acesso permitido apenas para administradores.' });
    return null;
  }

  return adminUserId;
}

// Busca um usuário pelo identificador de login e opcionalmente valida a senha.
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
            adm,
            ativo,
            criado_em,
            atualizado_em
       FROM users
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

// Busca um usuário pelo identificador interno.
async function findUserById(userId) {
  const [rows] = await db.execute(
    `SELECT id,
            nome_completo AS nome,
            numero_oab AS oab,
            cpf,
            email,
            nome_usuario AS usuario,
            senha_hash,
            adm,
            ativo,
            criado_em,
            atualizado_em
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

// Verifica se já existe outro usuário com o mesmo nome de usuário.
async function findUserByUsername(usuario, excludeUserId) {
  const [rows] = await db.execute(
    `SELECT id
       FROM users
      WHERE nome_usuario = ?
        AND id <> ?
      LIMIT 1`,
    [usuario, excludeUserId]
  );

  return rows[0] || null;
}

// Consulta uma solicitação pelo trio perfil, e-mail e CPF.
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
            adm,
            ativo,
            criado_em,
            atualizado_em
       FROM users
      WHERE email = ?
        AND cpf = ?
        AND ${profileWhere}
      LIMIT 1`,
    [email, cpf]
  );

  return rows[0] || null;
}

// Impede duplicidade de campos sensíveis durante o cadastro.
async function ensureUnique(field, value, label, res) {
  if (!value) return true;

  const [rows] = await db.execute(
    `SELECT id, ativo
       FROM users
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

// Processa o login respeitando perfil, senha e bloqueios por status.
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

// Recebe uma solicitação de acesso e grava o cadastro como pendente.
async function register(req, res) {
  try {
    const body = await readBody(req);
    const perfil = cleanValue(body.perfil);
    const nome = cleanValue(body.nome);
    const email = cleanValue(body.email);
    const senha = cleanValue(body.senha);
    const oab = digitsOnly(body.oab, 5);
    const cpf = digitsOnly(body.cpf, 11);
    const usuario = cleanValue(body.usuario);

    if (!perfil || !nome || !email || !senha) {
      return json(res, 400, { error: 'Campos obrigatorios nao informados.' });
    }

    if (perfil === 'advogado' && !oab) {
      return json(res, 400, { error: 'Numero OAB obrigatorio para advogados.' });
    }

    if (perfil === 'advogado' && oab.length !== 5) {
      return json(res, 400, { error: 'Numero OAB deve conter exatamente 5 numeros.' });
    }

    if (perfil === 'colaborador' && !usuario) {
      return json(res, 400, { error: 'Usuario obrigatorio para colaboradores.' });
    }

    if (!cpf || cpf.length !== 11) {
      return json(res, 400, { error: 'CPF deve conter exatamente 11 numeros.' });
    }

    if (!(await ensureUnique('numero_oab', oab, 'numero OAB', res))) return;
    if (!(await ensureUnique('nome_usuario', usuario, 'usuario', res))) return;

    await db.execute(
      `INSERT INTO users (
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

// Trata pedidos de recuperação e bloqueia contas não elegíveis.
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
         FROM users
        WHERE email = ?
          AND ${profileWhere}
        LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return json(res, 200, { success: true, message: 'Se o e-mail estiver cadastrado, voce recebera as instrucoes em breve.' });
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

// Permite ao solicitante consultar o andamento do cadastro.
async function getAccessRequestStatus(req, res) {
  try {
    const body = await readBody(req);
    const perfil = cleanValue(body.perfil);
    const email = cleanValue(body.email);
    const cpf = digitsOnly(body.cpf, 11);

    if (!perfil || !email || !cpf) {
      return json(res, 400, { error: 'Perfil, e-mail e CPF sao obrigatorios.' });
    }

    if (cpf.length !== 11) {
      return json(res, 400, { error: 'CPF deve conter exatamente 11 numeros.' });
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

// Carrega o dashboard administrativo com pendências, ativos e resumo.
async function listAccessRequests(req, res) {
  try {
    const adminUserId = await ensureAdmin(req, res);
    if (!adminUserId) return;

    const [pendingRows] = await db.execute(
      `SELECT id,
              nome_completo AS nome,
              numero_oab AS oab,
              cpf,
              email,
              nome_usuario AS usuario,
              adm,
              ativo,
              criado_em,
              atualizado_em
         FROM users
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
              adm,
              ativo,
              criado_em,
              atualizado_em
         FROM users
        WHERE ativo = ?
        ORDER BY atualizado_em DESC, nome_completo ASC`,
      [STATUS.APROVADO]
    );

    const [summaryRows] = await db.execute(
      `SELECT ativo, COUNT(*) AS total
         FROM users
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

// Atualiza o status de uma solicitação pendente e dispara e-mail ao aprovar.
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
    `UPDATE users
        SET ativo = ?,
            atualizado_em = NOW()
      WHERE id = ?`,
    [nextStatus, userId]
  );

  const updatedRequest = await findUserById(userId);
  const mappedRequest = mapUserRow(updatedRequest);
  let message = nextStatus === STATUS.APROVADO
    ? 'Solicitacao aprovada com sucesso.'
    : 'Solicitacao recusada com sucesso.';

  if (nextStatus === STATUS.APROVADO && mappedRequest.email) {
    try {
      await sendApprovalEmail(mappedRequest);
      message = 'Solicitacao aprovada com sucesso. Um e-mail foi enviado ao usuario.';
    } catch (err) {
      console.error('[admin/access-requests/approve-email]', err.message || err);
      message = 'Solicitacao aprovada com sucesso, mas nao foi possivel enviar o e-mail ao usuario.';
    }
  }

  return json(res, 200, {
    success: true,
    message,
    solicitacao: mappedRequest,
  });
}

// Aprova uma solicitação pendente.
async function approveAccessRequest(req, res, userId) {
  try {
    const adminUserId = await ensureAdmin(req, res);
    if (!adminUserId) return;

    return await updatePendingRequestStatus(res, userId, STATUS.APROVADO);
  } catch (err) {
    handleServerError(res, 'admin/access-requests/approve', err);
  }
}

// Recusa uma solicitação pendente.
async function rejectAccessRequest(req, res, userId) {
  try {
    const adminUserId = await ensureAdmin(req, res);
    if (!adminUserId) return;

    return await updatePendingRequestStatus(res, userId, STATUS.RECUSADO);
  } catch (err) {
    handleServerError(res, 'admin/access-requests/reject', err);
  }
}

// Desativa um cadastro já aprovado.
async function deactivateUserAccount(req, res, userId) {
  try {
    const adminUserId = await ensureAdmin(req, res);
    if (!adminUserId) return;

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
      `UPDATE users
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

// Define ou atualiza as credenciais de acesso de um colaborador.
async function setCollaboratorCredentials(req, res, userId) {
  try {
    const adminUserId = await ensureAdmin(req, res);
    if (!adminUserId) return;

    if (!Number.isInteger(userId) || userId <= 0) {
      return json(res, 400, { error: 'Identificador do usuario invalido.' });
    }

    const body = await readBody(req);
    const nome = cleanValue(body.nome);
    const cpf = digitsOnly(body.cpf, 11);
    const email = cleanValue(body.email);
    const usuario = cleanValue(body.usuario);
    const senha = cleanValue(body.senha);

    if (!nome || !cpf || !email || !usuario) {
      return json(res, 400, { error: 'Nome, CPF, e-mail e usuario sao obrigatorios.' });
    }

    if (cpf.length !== 11) {
      return json(res, 400, { error: 'CPF deve conter exatamente 11 numeros.' });
    }

    const user = await findUserById(userId);

    if (!user) {
      return json(res, 404, { error: 'Cadastro nao encontrado.' });
    }

    if (!isCollaboratorRow(user)) {
      return json(res, 409, { error: 'Somente colaboradores podem receber usuario e senha por esta acao.' });
    }

    const usernameConflict = await findUserByUsername(usuario, userId);

    if (usernameConflict) {
      return json(res, 409, { error: 'Este nome de usuario ja esta em uso.' });
    }

    if (senha) {
      await db.execute(
        `UPDATE users
            SET nome_completo = ?,
                cpf = ?,
                email = ?,
                nome_usuario = ?,
                senha_hash = SHA2(?, 256),
                atualizado_em = NOW()
          WHERE id = ?`,
        [nome, cpf, email, usuario, senha, userId]
      );
    } else {
      await db.execute(
        `UPDATE users
            SET nome_completo = ?,
                cpf = ?,
                email = ?,
                nome_usuario = ?,
                atualizado_em = NOW()
          WHERE id = ?`,
        [nome, cpf, email, usuario, userId]
      );
    }

    const updatedUser = await findUserById(userId);

    return json(res, 200, {
      success: true,
      message: senha
        ? 'Dados e credenciais do colaborador atualizados com sucesso.'
        : 'Dados do colaborador atualizados com sucesso.',
      solicitacao: mapUserRow(updatedUser),
    });
  } catch (err) {
    handleServerError(res, 'admin/access-requests/credentials', err);
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
  setCollaboratorCredentials,
};
