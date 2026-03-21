import { ENV } from "./env";
import { TRPCError } from "@trpc/server";

export interface EmailPayload {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

/**
 * Send email using Manus Forge API
 * Supports HTML and plain text content
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    console.error("[Email] Forge API configuration missing");
    return false;
  }

  try {
    const endpoint = new URL(
      "webdevtoken.v1.EmailService/SendEmail",
      ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`
    ).toString();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({
        to: payload.to,
        subject: payload.subject,
        htmlContent: payload.htmlContent,
        textContent: payload.textContent || stripHtml(payload.htmlContent),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Email] Failed to send email to ${payload.to} (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    console.log(`[Email] Successfully sent email to ${payload.to}`);
    return true;
  } catch (error) {
    console.error("[Email] Error sending email:", error);
    return false;
  }
}

/**
 * Send password reset email to user
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  userName: string,
  temporaryPassword: string,
  appUrl: string = "https://poultry-business-manager-development.up.railway.app"
): Promise<boolean> {
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h2 style="color: #2c5f2d; text-align: center;">AFGRO Poultry Manager</h2>
          
          <h3>Password Reset Notification</h3>
          
          <p>Hello <strong>${escapeHtml(userName)}</strong>,</p>
          
          <p>Your password has been reset by an administrator. Please use the temporary password below to log in:</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #2c5f2d; margin: 20px 0;">
            <p><strong>Temporary Password:</strong></p>
            <p style="font-size: 18px; font-weight: bold; color: #2c5f2d; font-family: monospace;">${escapeHtml(temporaryPassword)}</p>
          </div>
          
          <p><strong>Next Steps:</strong></p>
          <ol>
            <li>Visit <a href="${appUrl}">${appUrl}</a></li>
            <li>Log in with your username and the temporary password above</li>
            <li>You will be prompted to set a new password</li>
            <li>Use your new password for future logins</li>
          </ol>
          
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            <strong>Security Note:</strong> This temporary password will expire after your first login. 
            If you did not request this password reset, please contact your administrator immediately.
          </p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            AFGRO Poultry Manager<br>
            © 2026 All rights reserved
          </p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: userEmail,
    subject: "AFGRO Poultry Manager - Password Reset",
    htmlContent,
  });
}

/**
 * Strip HTML tags from content for plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
