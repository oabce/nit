require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendResetEmail(toEmail, resetLink) {
  await transporter.sendMail({
    from: `"NIT - OAB/CE" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Redefinição de senha - NIT OAB/CE',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f5f5f5;">
        <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
          <img src="${process.env.APP_URL}/assets/imgs/Logo1.1.png" alt="NIT" style="height:48px;margin-bottom:24px;" />
          <h2 style="color:#1b365d;font-size:20px;margin:0 0 8px;">Redefinição de senha</h2>
          <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px;">
            Recebemos uma solicitação para redefinir a senha da sua conta.
            Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.
          </p>
          <a href="${resetLink}" style="display:inline-block;background:#1b365d;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
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
      </div>
    `,
  });
}

module.exports = { sendResetEmail };
