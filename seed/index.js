const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedInterests() {
  console.log('\n--- Seeding Interests ---');
  const interests = [
    'Technology', 'Sports', 'Music', 'Art', 'Gaming',
    'Fashion', 'Food', 'Comedy', 'Emotional', 'Dance',
    'Village Life', 'Motivation', 'Fitness'
  ];
  for (const name of interests) {
    await prisma.interest.upsert({
      where: { name },
      update: {},
      create: { name }
    });
    console.log(`  interests: ${name}`);
  }
}

async function seedConfigs() {
  console.log('\n--- Seeding System Configs ---');
  const configs = [
    { key: 'VIEW_RATE_PER_1000', valueJson: 5, description: 'INR earned by creator per 1,000 valid views' },
    { key: 'MIN_WITHDRAWAL_INR', valueJson: 500, description: 'Minimum INR amount a creator can withdraw' },
    { key: 'TDS_PERCENTAGE', valueJson: 10, description: 'TDS percentage deducted at withdrawal time' },
    { key: 'PLATFORM_FEE_PERCENTAGE', valueJson: 2, description: 'Platform fee percentage deducted at withdrawal time' },
    { key: 'GIFT_CREATOR_SHARE_PERCENT', valueJson: 60, description: 'Percentage of gift base value credited to creator' },
    { key: 'GIFT_COIN_TO_INR_RATE', valueJson: 0.1, description: 'Fallback INR value per coin when gift.costInINR is not set' },
    { key: 'COIN_PURCHASE_PRICE_PER_COIN', valueJson: 1.25, description: 'INR price per coin when user buys coins' },
    { key: 'COIN_WITHDRAWAL_REDEEM_RATE', valueJson: 0.85, description: 'INR paid to creator per coin at withdrawal' },
    { key: 'VIEWER_COIN_REWARD_PER_VIEW', valueJson: 10, description: 'Coins awarded to viewer per valid view' },
    { key: 'VIEWER_COIN_MAX_DAILY', valueJson: 200, description: 'Maximum coins a viewer can earn per day from watching' },
    { key: 'LIKER_COIN_REWARD_PER_2_LIKES', valueJson: 1, description: 'Coins awarded to user for every 2 likes given' },
    { key: 'LIKER_COIN_MAX_DAILY', valueJson: 50, description: 'Maximum coins a user can earn per day from liking' },
    { key: 'REFERRAL_CREATOR_REWARD', valueJson: 100, description: 'INR reward for referrer when referred user completes KYC + first reel' },
    { key: 'REFERRAL_STANDARD_REWARD', valueJson: 25, description: 'INR reward for referred user when they complete KYC + first reel' },
    { key: 'REFERRAL_SUPER_REWARD', valueJson: 500, description: 'INR bonus reward for referring 10+ creators in a month' },
  ];
  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { description: config.description },
      create: { key: config.key, valueJson: config.valueJson, description: config.description, updatedBy: 'system' }
    });
    console.log(`  config: ${config.key} = ${config.valueJson}`);
  }
}

async function seedGifts() {
  console.log('\n--- Seeding Gifts ---');
  const gifts = [
    { id: 'star',    name: 'Star',    costInCoins: 5,    iconUrl: 'star',    animationType: 'fly',   sortOrder: 1 },
    { id: 'rose',    name: 'Rose',    costInCoins: 10,   iconUrl: 'rose',    animationType: 'burst', sortOrder: 2 },
    { id: 'heart',   name: 'Heart',   costInCoins: 50,   iconUrl: 'heart',   animationType: 'float', sortOrder: 3 },
    { id: 'party',   name: 'Party',   costInCoins: 150,  iconUrl: 'party',   animationType: 'burst', sortOrder: 4 },
    { id: 'sparkle', name: 'Sparkle', costInCoins: 300,  iconUrl: 'sparkle', animationType: 'float', sortOrder: 5 },
    { id: 'rocket',  name: 'Rocket',  costInCoins: 500,  iconUrl: 'rocket',  animationType: 'fly',   sortOrder: 6 },
    { id: 'crown',   name: 'Crown',   costInCoins: 2000, iconUrl: 'crown',   animationType: 'spin',  sortOrder: 7 },
    { id: 'diamond', name: 'Diamond', costInCoins: 5000, iconUrl: 'diamond', animationType: 'burst', sortOrder: 8 },
  ];
  for (const gift of gifts) {
    await prisma.gift.upsert({
      where: { id: gift.id },
      update: { name: gift.name, costInCoins: gift.costInCoins, iconUrl: gift.iconUrl, animationType: gift.animationType, sortOrder: gift.sortOrder },
      create: gift
    });
    console.log(`  gift: ${gift.name} (${gift.costInCoins} coins)`);
  }
}

async function seedCoinPackages() {
  console.log('\n--- Seeding Coin Packages ---');
  const packages = [
    { id: 'pkg-1', title: '100 Coins',   coins: 100,   bonusCoins: 0,    priceInr: 10,   badge: null,         badgeColor: null,      isPopular: false, isRecommended: false, isActive: true, sortOrder: 1 },
    { id: 'pkg-2', title: '500 Coins',   coins: 500,   bonusCoins: 0,    priceInr: 50,   badge: null,         badgeColor: null,      isPopular: false, isRecommended: false, isActive: true, sortOrder: 2 },
    { id: 'pkg-3', title: '1000 Coins',  coins: 1000,  bonusCoins: 100,  priceInr: 100,  badge: 'Popular',    badgeColor: '#A855F7', isPopular: true,  isRecommended: false, isActive: true, sortOrder: 3 },
    { id: 'pkg-4', title: '2000 Coins',  coins: 2000,  bonusCoins: 300,  priceInr: 200,  badge: null,         badgeColor: null,      isPopular: false, isRecommended: false, isActive: true, sortOrder: 4 },
    { id: 'pkg-5', title: '5000 Coins',  coins: 5000,  bonusCoins: 1000, priceInr: 500,  badge: 'Best Value', badgeColor: '#10B981', isPopular: false, isRecommended: true,  isActive: true, sortOrder: 5 },
    { id: 'pkg-6', title: '10000 Coins', coins: 10000, bonusCoins: 2500, priceInr: 1000, badge: 'Max Value',  badgeColor: '#EAB308', isPopular: false, isRecommended: false, isActive: true, sortOrder: 6 },
  ];
  for (const pkg of packages) {
    await prisma.coinPackage.upsert({
      where: { id: pkg.id },
      update: pkg,
      create: pkg
    });
    console.log(`  package: ${pkg.title} @ Rs.${pkg.priceInr}`);
  }
}

async function main() {
  console.log('Starting full seed...');
  await seedInterests();
  await seedConfigs();
  await seedGifts();
  await seedCoinPackages();
  console.log('\nAll seeds completed successfully.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());