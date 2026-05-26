'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const net = require('net');
const tls = require('tls');

const b64 = (s) => Buffer.from(String(s)).toString('base64');

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

    async upgradeTls(host) {
      sock.removeListener('data', onData);
      const ts = await new Promise((resolve, reject) => {
        let s;
        s = tls.connect({ socket: sock, host, servername: host, rejectUnauthorized: false }, () => resolve(s));
        s.once('error', reject);
      });
      sock = ts;
      buf = '';
      sock.on('data', onData);
    },

    destroy() { try { sock.destroy(); } catch (_) {} },
  };
}

async function sendMail({ host, port, secure, user, pass, from, to, subject, html }) {
  port = Number(port) || 587;
  const fromEmail = (from.match(/<(.+)>/) || [])[1] || from;

  let c;

  if (secure) {
    const tlsSock = await new Promise((resolve, reject) => {
      let s;
      s = tls.connect({ host, port, rejectUnauthorized: false }, () => resolve(s));
      s.once('error', reject);
    });
    c = createSmtpClient(tlsSock);
    const greeting = await c.read();
    if (greeting.code !== 220) throw new Error('SMTP greeting: ' + greeting.line);
    const ehlo = await c.expect(250, 'EHLO nit.oabce.org.br');
    console.log('[mailer] EHLO completo:', JSON.stringify(ehlo.lines));
  } else {
    const plainSock = await new Promise((resolve, reject) => {
      const s = net.connect(port, host, () => resolve(s));
      s.once('error', reject);
    });
    c = createSmtpClient(plainSock);
    const greeting = await c.read();
    console.log('[mailer] Greeting:', greeting.line);
    if (greeting.code !== 220) throw new Error('SMTP greeting: ' + greeting.line);
    const ehlo1 = await c.expect(250, 'EHLO nit.oabce.org.br');
    console.log('[mailer] EHLO antes STARTTLS:', ehlo1.lines);
    await c.expect(220, 'STARTTLS');
    await c.upgradeTls(host);
    const ehlo2 = await c.expect(250, 'EHLO nit.oabce.org.br');
    console.log('[mailer] EHLO após STARTTLS:', ehlo2.lines);
  }

  console.log('[mailer] Tentando AUTH PLAIN para usuario:', user);
  console.log('[mailer] Senha — tamanho:', pass.length, '| hex:', Buffer.from(pass).toString('hex'));
  const plainCreds = b64('\0' + user + '\0' + pass);
  c.write(`AUTH PLAIN ${plainCreds}`);
  const authResp = await c.read();
  console.log('[mailer] AUTH PLAIN resp:', authResp.line);

  if (authResp.code !== 235) {
    // Tenta AUTH LOGIN como fallback
    console.log('[mailer] AUTH PLAIN falhou, tentando AUTH LOGIN...');
    c.write('AUTH LOGIN');
    await c.read(); // 334 Username
    c.write(b64(user));
    await c.read(); // 334 Password
    c.write(b64(pass));
    const loginResp = await c.read();
    console.log('[mailer] AUTH LOGIN resp:', loginResp.line);
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

async function sendResetEmail(toEmail, resetLink) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await sendMail({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: `"NIT - OAB/CE" <${from}>`,
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

module.exports = { sendResetEmail };
