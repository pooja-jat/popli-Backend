import jwt from 'jsonwebtoken';

const JWT_SECRET = "ec5aba2ef6c3e226365e467d011cb850f1d50f14a729c51673e1dc1081b7794e662ddf19aaa3ca82e1350bfa31a6b4e4f26893e8c65361f42d5f3c4a9bf4fe7d";
const REEL_ID = "c6985b56-1fa9-444f-9697-739a517727a3";
const BASE_URL = "http://localhost:3001";
const DELAY_MS = 700;
const TOTAL_VIEWS = 200;

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("Set DATABASE_URL env variable");
  process.exit(1);
}

const { default: postgres } = await import('postgres');
const sql = postgres(DB_URL);

const users = await sql`
  SELECT id FROM "User" 
  WHERE username LIKE 'testuser%' 
  LIMIT ${TOTAL_VIEWS}
`;

await sql.end();

console.log(`Fetched ${users.length} test users`);
console.log(`Simulating ${TOTAL_VIEWS} views on reel ${REEL_ID}\n`);

async function registerView(userId, index) {
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
        deviceId: `test-device-${index}`,
        sessionId: `test-session-${index}`,
        watchDuration: 15000,
        completionPercent: 100,
      }),
    });

    const data = await res.json();
  console.log(`View ${index + 1} (${userId.slice(0, 8)}...): ${res.status} — ${JSON.stringify(data)} | duration: ${15000} | userId: ${userId}`);
  } catch (err) {
    console.error(`View ${index + 1} failed: ${err.message}`);
  }
}

for (let i = 0; i < users.length; i++) {
  await registerView(users[i].id, i);
  await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log('\nDone. Check wallet and ReelViewCount in DB.');
