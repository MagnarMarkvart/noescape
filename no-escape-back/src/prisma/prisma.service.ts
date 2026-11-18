import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** One PM2 process. Two Postgres backends are enough and stay off a small Supabase compute. */
function withConnectionLimit(url: string | undefined): string | undefined {
  if (!url || /[?&]connection_limit=/.test(url)) {
    return url;
  }
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}connection_limit=2&pool_timeout=20`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = withConnectionLimit(process.env.DATABASE_URL);
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
