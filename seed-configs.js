const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const configs = [
    { key: 'VIEW_RATE_PER_1000', valueJson: 5 },
    { key: 'TDS_PERCENTAGE', valueJson: 10 },
    { key: 'PLATFORM_FEE_PERCENTAGE', valueJson: 2 },
    { key: 'MIN_WITHDRAWAL_INR', valueJson: 500 },
  ];

  for (const c of configs) {
    await prisma.systemConfig.upsert({
      where: { key: c.key },
      update: {},
      create: { key: c.key, valueJson: c.valueJson, updatedBy: 'system' },
    });
    console.log(`Seeded: ${c.key} = ${c.valueJson}`);
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });