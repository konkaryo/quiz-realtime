import { Resend } from "resend";

const APP_BASE_URL = process.env.APP_BASE_URL || process.env.CLIENT_URL || "https://synapz.online";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  return new Resend(apiKey);
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
) {
  return getResendClient().emails.send({
    from: "Synapz <auth@synapz.online>",
    to,
    subject,
    html,
  });
}

export async function sendVerificationEmail(email: string, token: string) {
  const verifyUrl = new URL("/verify-email", APP_BASE_URL);
  verifyUrl.searchParams.set("token", token);

  return sendEmail(
    email,
    "Vérifiez votre adresse email",
    `
      <h2>Bienvenue sur Synapz 👋</h2>
      <p>Confirmez votre adresse email pour activer votre compte.</p>
      <p><a href="${verifyUrl.toString()}">Vérifier mon email</a></p>
      <p>Ce lien expire dans 24 heures.</p>
    `
  );
}

export async function sendResetPasswordEmail(email: string, token: string) {
  const resetUrl = new URL("/reset-password", APP_BASE_URL);
  resetUrl.searchParams.set("token", token);

  return sendEmail(
    email,
    "Réinitialisation de votre mot de passe",
    `
      <h2>Demande de réinitialisation</h2>
      <p>Vous pouvez définir un nouveau mot de passe en cliquant sur le lien ci-dessous.</p>
      <p><a href="${resetUrl.toString()}">Réinitialiser mon mot de passe</a></p>
      <p>Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    `
  );
}
