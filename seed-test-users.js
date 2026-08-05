const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TOTAL_USERS = 200;
const BATCH_PREFIX = 'testuser_batch2';

async function main() {
  console.log(`Creating ${TOTAL_USERS} fresh test users...`);

  let created = 0;

  for (let i = 1; i <= TOTAL_USERS; i++) {
    const username = `${BATCH_PREFIX}_${i}`;
    const phone = `TEST2${String(i).padStart(9, '0')}`;
    const referralCode = `TB2${String(i).padStart(5, '0')}`;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { phone }] },
    });

    if (existing) {
      console.log(`  skip: ${username} already exists`);
      continue;
    }

    const user = await prisma.user.create({
      data: {
        phone,
        username,
        name: `Test User B2 ${i}`,
        isProfileComplete: false,
        referralCode,
      },
    });

    await prisma.wallet.create({ data: { userId: user.id } });
    await prisma.userPreference.create({ data: { userId: user.id } });

    created++;
    console.log(`  created: ${username} (${user.id})`);
  }

  console.log(`\nDone. ${created} users created.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());