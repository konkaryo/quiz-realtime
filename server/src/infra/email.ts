import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(
  to: string,
  subject: string,
  html: string
) {
  return resend.emails.send({
    from: "Synapz <auth@synapz.online>",
    to,
    subject,
    html,
  });
}