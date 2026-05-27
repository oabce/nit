'use strict';
const envFile = require('../envFile');
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');

const b64 = (s) => Buffer.from(String(s)).toString('base64');
const LEGACY_TLS_OPTIONS = {
  minVersion: 'TLSv1',
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT || 0,
};

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function normalizePassword(value) {
  if (typeof value !== 'string') return value;

  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getEhloName() {
  try {
    const appUrl = envFile.get('APP_URL');
    if (!appUrl) return 'localhost';
    return new URL(appUrl).hostname || 'localhost';
  } catch {
    return 'localhost';
  }
}

function getTlsOptions(host, compatibilityMode) {
  return {
    host,
    servername: host,
    rejectUnauthorized: false,
    ...(compatibilityMode ? LEGACY_TLS_OPTIONS : {}),
  };
}

function createSmtpClient(initialSock) {
  let sock = initialSock;
  let buf = '';
  let resolver = null;

  function onData(chunk) {
    buf += chunk.toString();
    tryResolve();
  }

  function tryResolve() {
    if (!resolver) return;
    let pos = 0;
    const collected = [];
    while (pos < buf.length) {
      const end = buf.indexOf('\r\n', pos);
      if (end === -1) break;
      const line = buf.slice(pos, end);
      collected.push(line);
      if (/^\d{3} /.test(line)) {
        buf = buf.slice(end + 2);
        const code = parseInt(line.slice(0, 3), 10);
        const r = resolver;
        resolver = null;
        r({ code, line, lines: collected });
        return;
      }
      pos = end + 2;
    }
  }

  sock.on('data', onData);

  return {
    read(ms = 12000) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          resolver = null;
          reject(new Error('SMTP timeout'));
        }, ms);
        resolver = (r) => { clearTimeout(t); resolve(r); };
        tryResolve();
      });
    },

    write(line) { sock.write(line + '\r\n'); },
    writeRaw(data) { sock.write(data); },

    async expect(code, cmd) {
      if (cmd !== undefined) this.write(cmd);
      const r = await this.read();
      if (r.code !== code) throw new Error(`SMTP: esperado ${code}, recebido ${r.code} — ${r.line}`);
      return r;
    },

    async upgradeTls(host, compatibilityMode) {
      sock.removeListener('data', onData);
      const ts = await new Promise((resolve, reject) => {
        let s;
        s = tls.connect({ socket: sock, ...getTlsOptions(host, compatibilityMode) }, () => resolve(s));
        s.once('error', reject);
      });
      sock = ts;
      buf = '';
      sock.on('data', onData);
    },

    destroy() { try { sock.destroy(); } catch (_) {} },
  };
}

function buildTransportAttempts({ host, port, secure }) {
  const configuredPort = Number(port) || (secure ? 465 : 587);
  const attempts = [
    { host, port: configuredPort, secure, compatibilityMode: false },
  ];

  if (configuredPort === 465) {
    attempts.push({ host, port: 587, secure: false, compatibilityMode: false });
  } else if (configuredPort === 587) {
    attempts.push({ host, port: 465, secure: true, compatibilityMode: false });
  }

  const compatibilityFallbacks = attempts.map((attempt) => ({
    ...attempt,
    compatibilityMode: true,
  }));

  return [...attempts, ...compatibilityFallbacks].filter(
    (attempt, index, list) => list.findIndex((item) =>
      item.host === attempt.host
      && item.port === attempt.port
      && item.secure === attempt.secure
      && item.compatibilityMode === attempt.compatibilityMode
    ) === index
  );
}

async function sendMailAttempt({ host, port, secure, user, pass, from, to, subject, html, compatibilityMode }) {
  const fromEmail = (from.match(/<(.+)>/) || [])[1] || from;
  const ehloName = getEhloName();
  const smtpPassword = normalizePassword(pass);

  let c;

  if (secure) {
    const tlsSock = await new Promise((resolve, reject) => {
      let s;
      s = tls.connect({ host, port, ...getTlsOptions(host, compatibilityMode) }, () => resolve(s));
      s.once('error', reject);
    });
    c = createSmtpClient(tlsSock);
    const greeting = await c.read();
    if (greeting.code !== 220) throw new Error('SMTP greeting: ' + greeting.line);
    await c.expect(250, `EHLO ${ehloName}`);
  } else {
    const plainSock = await new Promise((resolve, reject) => {
      const s = net.connect(port, host, () => resolve(s));
      s.once('error', reject);
    });
    c = createSmtpClient(plainSock);
    const greeting = await c.read();
    if (greeting.code !== 220) throw new Error('SMTP greeting: ' + greeting.line);
    await c.expect(250, `EHLO ${ehloName}`);
    await c.expect(220, 'STARTTLS');
    await c.upgradeTls(host, compatibilityMode);
    await c.expect(250, `EHLO ${ehloName}`);
  }

  const plainCreds = b64('\0' + user + '\0' + smtpPassword);
  c.write(`AUTH PLAIN ${plainCreds}`);
  const authResp = await c.read();

  if (authResp.code !== 235) {
    c.write('AUTH LOGIN');
    await c.read();
    c.write(b64(user));
    await c.read();
    c.write(b64(smtpPassword));
    const loginResp = await c.read();
    if (loginResp.code !== 235) throw new Error(`SMTP AUTH falhou: ${loginResp.line}`);
  }

  await c.expect(250, `MAIL FROM:<${fromEmail}>`);
  await c.expect(250, `RCPT TO:<${to}>`);
  await c.expect(354, 'DATA');

  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    '',
  ].join('\r\n');

  c.writeRaw(headers + html.replace(/\r?\n/g, '\r\n') + '\r\n.\r\n');
  await c.expect(250);

  c.write('QUIT');
  setTimeout(() => c.destroy(), 500);
}

async function sendMail(options) {
  const secure = parseBoolean(options.secure, false);
  const attempts = buildTransportAttempts({
    host: options.host,
    port: options.port,
    secure,
  });
  const errors = [];

  for (const attempt of attempts) {
    try {
      await sendMailAttempt({
        ...options,
        ...attempt,
      });
      return;
    } catch (err) {
      const label = `${attempt.host}:${attempt.port} ${attempt.secure ? 'SSL/TLS' : 'STARTTLS'}${attempt.compatibilityMode ? ' compat' : ''}`;
      errors.push(`${label} -> ${err.message || err}`);
    }
  }

  throw new Error(`Falha ao enviar e-mail. Tentativas SMTP: ${errors.join(' | ')}`);
}

async function sendResetEmail(toEmail, resetLink) {
  await sendMail({
    host: envFile.get('SMTP_HOST'),
    port: envFile.get('SMTP_PORT'),
    secure: envFile.get('SMTP_SECURE') === 'true',
    user: envFile.get('SMTP_USER'),
    pass: envFile.get('SMTP_PASS'),
    from: `"NIT - OAB/CE" <${envFile.get('SMTP_FROM') || envFile.get('SMTP_USER')}>`,
    to: toEmail,
    subject: 'Redefinição de senha - NIT OAB/CE',
    html: `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f5f5f5;">
  <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
    <h2 style="color:#1b365d;font-size:20px;margin:0 0 8px;">Redefinição de senha</h2>
    <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;">
      Recebemos uma solicitação para redefinir a senha da sua conta.
      Clique no botão abaixo para criar uma nova senha.
      O link expira em <strong>1 hora</strong>.
    </p>
    <a href="${resetLink}"
       style="display:inline-block;background:#1b365d;color:#fff;text-decoration:none;
              padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
      Redefinir senha
    </a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.6;">
      Se você não solicitou a redefinição, ignore este e-mail.<br/>
      Por segurança, nunca compartilhe este link.
    </p>
  </div>
  <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;">
    © 2026 NIT - OAB/CE. Todos os direitos reservados.
  </p>
</div>`,
  });
}

function buildPortalUrl(pathname = '/login.html') {
  const appUrl = envFile.get('APP_URL');

  if (!appUrl) {
    return pathname;
  }

  return new URL(pathname, appUrl).toString();
}

async function sendApprovalEmail(user) {
  const isAdvogado = Boolean(user.oab);
  const portalUrl = buildPortalUrl('/login.html');
  const accessLabel = isAdvogado ? 'Numero OAB ou e-mail' : 'Usuario ou e-mail';
  const accessValue = isAdvogado ? (user.oab || user.email) : (user.usuario || user.email);
  const profileLabel = isAdvogado ? 'advogado' : 'colaborador';

  await sendMail({
    host: envFile.get('SMTP_HOST'),
    port: envFile.get('SMTP_PORT'),
    secure: envFile.get('SMTP_SECURE') === 'true',
    user: envFile.get('SMTP_USER'),
    pass: envFile.get('SMTP_PASS'),
    from: `"NIT - OAB/CE" <${envFile.get('SMTP_FROM') || envFile.get('SMTP_USER')}>`,
    to: user.email,
    subject: 'Solicitacao aprovada - NIT OAB/CE',
    html: `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f5f5f5;">
  <div style="background:#ffffff;border-radius:14px;padding:32px;border:1px solid #e2e8f0;">
    <h2 style="color:#12304d;font-size:22px;margin:0 0 10px;">Solicitacao aprovada</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 18px;">
      Ola, <strong>${user.nome}</strong>.
      Sua solicitacao de acesso ao sistema do NIT foi aprovada com sucesso.
    </p>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 18px;">
      Perfil liberado: <strong>${profileLabel}</strong><br/>
      ${accessLabel}: <strong>${accessValue}</strong>
    </p>
    <a href="${portalUrl}"
       style="display:inline-block;background:#12304d;color:#ffffff;text-decoration:none;
              padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700;">
      Acessar sistema
    </a>
    <p style="color:#64748b;font-size:13px;line-height:1.7;margin:24px 0 0;">
      Caso tenha dificuldades para entrar, procure a administracao do sistema.
    </p>
  </div>
  <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;">
    © 2026 NIT - OAB/CE. Todos os direitos reservados.
  </p>
</div>`,
  });
}

module.exports = { sendResetEmail, sendApprovalEmail };
