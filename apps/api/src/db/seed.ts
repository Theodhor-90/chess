import bcrypt from "bcrypt";
import { db } from "./index.js";
import { users } from "./schema.js";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 10;

const seedUsers = [
  { email: "test@email.com", password: "testtest" },
  { email: "test2@email.com", password: "test2test2" },
];

for (const { email, password } of seedUsers) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const existing = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) {
    db.update(users).set({ passwordHash }).where(eq(users.email, email)).run();
    console.log(`Updated password for "${email}" (id=${existing.id})`);
  } else {
    const result = db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email })
      .get();
    console.log(`Seeded user: id=${result.id}, email=${result.email}`);
  }
}
