import jwt from 'jsonwebtoken';
import postgres from 'postgres';

const JWT_SECRET = "ec5aba2ef6c3e226365e467d011cb850f1d50f14a729c51673e1dc1081b7794e662ddf19aaa3ca82e1350bfa31a6b4e4f26893e8c65361f42d5f3c4a9bf4fe7d";
const REEL_ID = "c6985b56-1fa9-444f-9697-739a517727a3";
const BASE_URL = "http://localhost:3001";
const DELAY_MS = 700;
const TOTAL_VIEWS = 200;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("Set DATABASE_URL env variable");
  process.exit(1);
}

const sql = postgres(DB_URL);

const users = await sql`
  SELECT id FROM "User"
  WHERE username LIKE 'testuser_batch2%'
  ORDER BY "createdAt" ASC
  LIMIT ${TOTAL_VIEWS}
`;
await sql.end();

if (users.length < TOTAL_VIEWS) {
  console.error(`Need ${TOTAL_VIEWS} test users but only found ${users.length}`);
  process.exit(1);
}

console.log(`Fetched ${users.length} test users`);
console.log(`Simulating ${TOTAL_VIEWS} views on reel ${REEL_ID}\n`);

let successCount = 0;
let failCount = 0;

async function registerView(userId, index, attempt = 1) {
  const token = jwt.sign(
    { sub: userId, id: userId },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  try {
    const res = await fetch(`${BASE_URL}/reels/${REEL_ID}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        deviceId: `test-device-${index}-${userId}`,
        sessionId: `test-session-${index}-${userId}`,
        watchDuration: 15000,
        completionPercent: 100,
      }),
    });

    if (res.status === 429 && attempt <= MAX_RETRIES) {
      console.warn(`View ${index + 1} throttled (429) — retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return registerView(userId, index, attempt + 1);
    }

    const data = await res.json();

    if (res.status === 200 || res.status === 201) {
      successCount++;
      console.log(`[OK] View ${index + 1} (${userId.slice(0, 8)}): ${JSON.stringify(data)}`);
    } else {
      failCount++;
      console.error(`[FAIL] View ${index + 1} (${userId.slice(0, 8)}): HTTP ${res.status} — ${JSON.stringify(data)}`);
    }
  } catch (err) {
    failCount++;
    console.error(`[ERROR] View ${index + 1} failed: ${err.message}`);
  }
}

for (let i = 0; i < users.length; i++) {
  await registerView(users[i].id, i);
  await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log(`\nDone. Success: ${successCount} | Failed: ${failCount}`);
console.log('Check ReelViewCount and Wallet in DB.');