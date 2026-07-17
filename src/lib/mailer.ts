// SERVER-ONLY. Reads RESEND_API_KEY/EMAIL_FROM from the process environment, so
// it must never be imported by client-reachable code (route components, client
// components). Auth config and server functions may import it freely.
//
// Deliberately a fetch against Resend's HTTP API rather than an SDK: sending
// plain-text mail is one POST, and this keeps the dependency count at zero. If
// the app moves off Resend, this module is the only thing that changes.

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

// Sends via Resend when configured; otherwise logs to the server console so the
// auth flows are fully exercisable in local dev without an email service.
export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.log(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) {
    throw new Error(`mail send failed: ${res.status} ${await res.text()}`);
  }
}
