import { prisma } from "./db.js";
import { hashPassword } from "./services/userAuth.js";

export async function seedDevAdmin() {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const adminEmail = "admin@edge.ge";
  
  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (existingAdmin) {
    console.log("Dev admin user already exists, skipping seed.");
    return;
  }

  const passwordHash = await hashPassword("Password123");

  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      fullName: "Dev Admin",
      role: "admin"
    }
  });

  console.log("Dev admin user created: admin@edge.ge / Password123");
}
