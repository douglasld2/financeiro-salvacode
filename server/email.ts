import nodemailer from "nodemailer";

function requireEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM_EMAIL;

  if (!host || host.trim().length === 0) {
    throw new Error("SMTP_HOST não configurado corretamente");
  }
  if (!user || !pass) {
    throw new Error("Credenciais SMTP não configuradas corretamente");
  }
  if (!from) {
    throw new Error("SMTP_FROM_EMAIL não configurado");
  }

  return { host, port, user, pass, from };
}

export async function sendCollectionEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const { host, port, user, pass, from } = requireEmailConfig();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br>"),
  });
}
