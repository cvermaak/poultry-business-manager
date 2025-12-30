import bcrypt from "bcrypt";
import { db } from "../runtime/db";
import { users } from "../runtime/schema";

async function main() {
  const password = "Admin123!";
  const hash = await bcrypt.hash(password, 12);

  const exists = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, "admin@afgro.co.za"),
  });

  if (exists) {
    console.log("Admin already exists.");
    process.exit(0);
  }

  await db.insert(users).values({
    email: "admin@afgro.co.za",
    name: "AFGRO Admin",
    openId: "bootstrap-admin",
    loginMethod: "password",
    role: "admin",
    isActive: true,
    mustChangePassword: false,
    passwordHash: hash,
  });

  console.log("Admin created successfully.");
  process.exit(0);
}

main();
