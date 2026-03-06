import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = process.env.SMTP_FROM || "noreply@example.com";

export async function sendInviteEmail({
  to,
  orgName,
  token,
  role,
}: {
  to: string;
  orgName: string;
  token: string;
  role: string;
}) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const acceptUrl = `${baseUrl}/api/invites/accept?token=${token}`;

  await transporter.sendMail({
    from: FROM_ADDRESS,
    to,
    subject: `You've been invited to join ${orgName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You're invited!</h2>
        <p>You've been invited to join <strong>${orgName}</strong> as a <strong>${role}</strong>.</p>
        <p>Click the button below to accept the invitation:</p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${acceptUrl}"
             style="background-color: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Accept Invitation
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          This invitation expires in 7 days. If you don't have an account yet, you'll need to
          <a href="${baseUrl}/register">sign up</a> first with this email address, then click the link above.
        </p>
      </div>
    `,
  });
}
