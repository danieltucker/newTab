// Grants (or revokes) admin on a user from the command line.
// Needed to bootstrap the first admin — after that, use the in-app panel.
//
//   npm run make-admin -- <username>
//   npm run make-admin -- <username> --revoke
import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
  const args = process.argv.slice(2);
  const username = args.find(a => !a.startsWith('--'));
  const revoke = args.includes('--revoke');

  if (!username) {
    console.error('Usage: npm run make-admin -- <username> [--revoke]');
    process.exit(1);
  }

  const result = await prisma.user.updateMany({
    where: { username },
    data: { isAdmin: !revoke },
  });

  if (result.count === 0) {
    console.error(`No user named "${username}" found.`);
    process.exit(1);
  }
  console.log(`${revoke ? 'Revoked admin from' : 'Granted admin to'} "${username}".`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
