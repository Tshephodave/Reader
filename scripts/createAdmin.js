// Usage: npm run create-admin -- <email> <password> [username]
// Creates an admin account, or promotes an existing account to admin.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

(async () => {
  const [email, password, username] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password> [username]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const normalized = email.trim().toLowerCase();

  const existing = await User.findOne({ email: normalized });
  if (existing) {
    existing.role = 'admin';
    await existing.save();
    console.log(`Promoted ${normalized} to admin (password unchanged).`);
  } else {
    await User.create({
      username: username || normalized.split('@')[0],
      email: normalized,
      password: await bcrypt.hash(password, 10),
      role: 'admin',
    });
    console.log(`Created admin ${normalized}.`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
