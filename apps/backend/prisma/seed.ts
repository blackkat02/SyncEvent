import { PrismaClient, Visibility } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const password = await bcrypt.hash('password123', 10);

  const user1 = await prisma.user.upsert({
    where: { email: 'eduard@example.com' },
    update: {},
    create: {
      email: 'eduard@example.com',
      password,
      displayName: 'eduard',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'jane@example.com' },
    update: {},
    create: {
      email: 'jane@example.com',
      password,
      displayName: 'Jane Participant',
    },
  });

  const user3 = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password,
      displayName: 'Admin User',
    },
  });

  await prisma.event.upsert({
    where: { id: 'event-sold-out' },
    update: {
      participants: {
        set: [{ id: user2.id }, { id: user3.id }],
      },
    },
    create: {
      id: 'event-sold-out',
      title: 'Sold Out Workshop',
      description:
        'This event is already full to test UI labels and capacity logic',
      date: new Date('2026-12-01T10:00:00Z'),
      location: 'Small Meeting Room',
      capacity: 2,
      visibility: Visibility.PUBLIC,
      authorId: user1.id,
      participants: {
        connect: [{ id: user2.id }, { id: user3.id }],
      },
    },
  });

  await prisma.event.upsert({
    where: { id: 'event-main' },
    update: {},
    create: {
      id: 'event-main',
      title: 'Tech Conference 2026',
      description:
        'Annual technology conference featuring the latest innovations',
      date: new Date('2026-11-15T09:00:00Z'),
      location: 'Convention Center, San Francisco',
      capacity: 500,
      visibility: Visibility.PUBLIC,
      authorId: user1.id,
      participants: {
        connect: [{ id: user2.id }],
      },
    },
  });

  await prisma.event.upsert({
    where: { id: 'event-private' },
    update: {},
    create: {
      id: 'event-private',
      title: 'Secret Strategy Meeting',
      description: 'Only for invited organizers',
      date: new Date('2026-12-10T15:00:00Z'),
      location: 'Hidden Office',
      capacity: 10,
      visibility: Visibility.PRIVATE,
      authorId: user3.id,
    },
  });
}

main()
  .catch(() => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
