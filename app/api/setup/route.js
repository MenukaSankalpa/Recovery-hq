import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/db';
import { handle, json, readBody, HttpError } from '@/lib/auth';
import { User } from '@/models';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await dbConnect();
  const count = await User.countDocuments();
  return json({ needsSetup: count === 0, needsKey: !!process.env.SETUP_KEY });
});

// Creates the first CEO account. Only works while there are no users at all.
export const POST = handle(async (req) => {
  await dbConnect();
  if ((await User.countDocuments()) > 0) throw new HttpError(403, 'Setup already completed');
  const { name, username, password, setupKey } = await readBody(req);
  if (process.env.SETUP_KEY && setupKey !== process.env.SETUP_KEY) throw new HttpError(403, 'Wrong setup key');
  if (!name || !username || !password) throw new HttpError(400, 'All fields are required');
  if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  await User.create({
    name,
    username,
    passwordHash: await bcrypt.hash(String(password), 10),
    role: 'ceo',
    canEnter: true,
    canCollect: true,
    team: 'Management',
  });
  return json({ ok: true });
});
