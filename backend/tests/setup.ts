import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  const hashedPassword = await bcrypt.hash('test123', 10);

  await prisma.user.upsert({
    where: { email: 'valid@example.com' },
    update: {},
    create: {
      name: 'Test User',
      email: 'valid@example.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log('✅ Test user seeded');
  await prisma.$disconnect();
}

seed();
