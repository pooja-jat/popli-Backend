// test-fcm.js (backend root mein)
require('dotenv/config');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

admin.messaging().send({
  token: 'dXkElBr_Th2RYN3a2825Mm:APA91bHKsoOgq6xo5bs2p9i0sKIs18F7BSkgc_g0oCA-vzmGgjgu7QqByovdLO_ZYtFUMUud5vyKCbtrWdu8LNQ8L2mF-rIAukWvTguLwz1G2H6cD3UINlA',
  notification: { title: 'Test', body: 'FCM working!' },
  android: { priority: 'high' },
}).then(r => console.log('SUCCESS:', r)).catch(e => console.error('FAILED:', e));