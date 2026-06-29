import path from 'path';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/newtab?schema=public';

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  datasource: {
    url: DATABASE_URL,
  },
  migrate: {
    async adapter(_env: Record<string, string | undefined>) {
      const pool = new Pool({ connectionString: DATABASE_URL });
      return new PrismaPg(pool);
    },
  },
});
