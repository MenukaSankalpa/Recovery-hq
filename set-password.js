const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const USERNAME = 'radesh';
const NEW_PASSWORD = 'Radesh@1456';

const uri = fs.readFileSync('.env.local', 'utf8').match(/MONGODB_URI=(.*)/)[1].trim();

(async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const r = await db.collection('users').updateOne(
    { username: USERNAME },
    { $set: { passwordHash: await bcrypt.hash(NEW_PASSWORD, 10), active: true } }
  );
  if (!r.matchedCount) {
    console.log(`❌ User "${USERNAME}" not found in database ${db.databaseName}`);
  } else {
    // sign this user out everywhere so the new password is needed
    const u = await db.collection('users').findOne({ username: USERNAME });
    await db.collection('sessions').updateMany({ user: u._id, logoutAt: null }, { $set: { logoutAt: new Date(), logoutReason: 'disabled' } });
    console.log(`✅ Password updated in ${db.databaseName}: ${USERNAME} / ${NEW_PASSWORD}`);
  }
  process.exit(0);
})().catch((e) => { console.log('❌', e.message); process.exit(1); });