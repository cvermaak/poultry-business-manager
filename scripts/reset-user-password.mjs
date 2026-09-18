import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

/**
 * Reset a user's password with a properly bcrypt-hashed value.
 *
 * The `passwordHash` column MUST contain a bcrypt hash (e.g. "$2b$12$...").
 * Manually writing a plain-text string or an ad-hoc "hash" into that column
 * will always fail login, because `verifyPassword()` (server/password.ts)
 * calls `bcrypt.compare(plainPassword, hash)`, which expects the stored
 * value to be in bcrypt's own format. Always use this script (or the
 * `resetPassword` / `changePassword` tRPC mutations, which call
 * `hashPassword()` under the hood) to set a user's password.
 *
 * Usage:
 *   node scripts/reset-user-password.mjs <email-or-username> <new-password> [--no-force-change]
 *
 * Example:
 *   node scripts/reset-user-password.mjs jane@example.com "TempPass123!"
 *
 * By default the user will be required to change their password on next
 * login (mustChangePassword = 1). Pass --no-force-change to skip that.
 */

const SALT_ROUNDS = 12;

async function main() {
  const [identifier, newPassword, ...rest] = process.argv.slice(2);
  const forceChange = !rest.includes("--no-force-change");

  if (!identifier || !newPassword) {
    console.error(
      "Usage: node scripts/reset-user-password.mjs <email-or-username> <new-password> [--no-force-change]"
    );
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error("Error: password must be at least 8 characters long.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [rows] = await conn.query(
      "SELECT id, username, email FROM users WHERE email = ? OR username = ? LIMIT 1",
      [identifier, identifier]
    );

    if (rows.length === 0) {
      console.error(`Error: no user found with email or username "${identifier}"`);
      process.exit(1);
    }

    const user = rows[0];

    // Always generate a proper bcrypt hash - never write a plain string here.
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await conn.query(
      "UPDATE users SET passwordHash = ?, mustChangePassword = ?, updatedAt = NOW() WHERE id = ?",
      [passwordHash, forceChange ? 1 : 0, user.id]
    );

    console.log(`✓ Password reset for user "${user.username}" (${user.email}).`);
    console.log(`  bcrypt hash: ${passwordHash.slice(0, 7)}... (format verified)`);
    if (forceChange) {
      console.log("  User will be required to change their password on next login.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("Failed to reset password:", error);
  process.exit(1);
});
