const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const configs = [
    { key: 'VIEWS_PER_REWARD', valueJson: 200 },
    { key: 'REWARD_AMOUNT_PAISE', valueJson: 100 },
    { key: 'EARNINGS_ENABLED', valueJson: true },
    { key: 'MIN_WATCH_DURATION_MS', valueJson: 10000 },
    { key: 'MIN_WITHDRAWAL_INR', valueJson: 100 },
    { key: 'TDS_PERCENTAGE', valueJson: 10 },
    { key: 'PLATFORM_FEE_PERCENTAGE', valueJson: 5 },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      create: config,
      update: {},
    });
  }

  console.log('SystemConfig seeded');
}

main().finally(() => prisma.$disconnect());