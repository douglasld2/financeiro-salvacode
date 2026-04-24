import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: parseInt(process.env.SMTP_PORT || "587") === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendCollectionEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const from = process.env.SMTP_FROM_EMAIL;
  if (!from) {
    throw new Error("SMTP_FROM_EMAIL não configurado");
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br>"),
  });
}
