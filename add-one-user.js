const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ---- edit these ----
const NAME = 'Nathasha';
const USERNAME = 'nathasha';
const PASSWORD = 'Nathasha@2026';
const ROLE = 'ceo';          // 'staff' = collector, 'ceo' = CEO dashboard
const TEAM = 'Management';
const CAN_COLLECT = true;    // can be assigned customers and record payments / promises
const CAN_ENTER = true;      // can add / edit customers
// --------------------

const uri = fs.readFileSync('.env.local', 'utf8').match(/MONGODB_URI=(.*)/)[1].trim();

(async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const now = new Date();
  await db.collection('users').updateOne(
    { username: USERNAME },
    {
      $set: { name: NAME, passwordHash: await bcrypt.hash(PASSWORD, 10), role: ROLE, team: TEAM, canCollect: CAN_COLLECT, canEnter: CAN_ENTER, active: true, updatedAt: now },
      $setOnInsert: { username: USERNAME, phone: '', createdAt: now, __v: 0 },
    },
    { upsert: true }
  );
  // sign out any old session so the new role applies straight away
  const u = await db.collection('users').findOne({ username: USERNAME });
  await db.collection('sessions').updateMany({ user: u._id, logoutAt: null }, { $set: { logoutAt: now, logoutReason: 'disabled' } });
  console.log(`✅ ${db.databaseName}: ${NAME} (${ROLE === 'ceo' ? 'CEO' : 'Collector'}) — login ${USERNAME} / ${PASSWORD}`);
  process.exit(0);
})().catch((e) => { console.log('❌', e.message); process.exit(1); });