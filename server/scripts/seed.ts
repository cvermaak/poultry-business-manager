import { db } from '../db'
import { users } from '../schema/users'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

async function run() {
  const existing = await db.select().from(users).where(eq(users.email, 'admin@afgro.co.za'))

  if (existing.length) {
    console.log('Admin already exists.')
    return
  }

  const password = await bcrypt.hash('Admin@123', 10)

  await db.insert(users).values({
    username: 'admin',
    name: 'System Admin',
    email: 'admin@afgro.co.za',
    password,
    role: 'admin',
    loginMethod: 'email',
    isActive: true
  })

  console.log('Admin user created.')
}

run().process.exit(0)
