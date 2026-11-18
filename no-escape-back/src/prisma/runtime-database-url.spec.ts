import { runtimeDatabaseUrl } from './runtime-database-url';

describe('runtimeDatabaseUrl', () => {
  it('leaves an empty url alone', () => {
    expect(runtimeDatabaseUrl(undefined)).toBeUndefined();
    expect(runtimeDatabaseUrl('')).toBe('');
  });

  it('moves the Supabase transaction pooler onto session port 5432 and caps the pool', () => {
    expect(
      runtimeDatabaseUrl(
        'postgresql://postgres.ref:secret@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
      ),
    ).toBe(
      'postgresql://postgres.ref:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?connection_limit=2&pool_timeout=20',
    );
  });

  it('keeps an existing connection limit and still rewrites the port', () => {
    expect(
      runtimeDatabaseUrl(
        'postgresql://postgres:postgres@db.example.com:6543/postgres?connection_limit=5',
      ),
    ).toBe(
      'postgresql://postgres:postgres@db.example.com:5432/postgres?connection_limit=5',
    );
  });

  it('does not touch the local Supabase port', () => {
    expect(
      runtimeDatabaseUrl(
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      ),
    ).toBe(
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres?connection_limit=2&pool_timeout=20',
    );
  });
});
