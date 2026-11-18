-- Imported rows keep their ids, but Postgres sequences stay behind.
-- The next insert then collides on the primary key and the API returns 500.
DO $$
DECLARE
  r record;
  seq text;
  max_id bigint;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'id'
      AND c.data_type IN ('integer', 'bigint')
  LOOP
    seq := pg_get_serial_sequence(format('%I.%I', r.table_schema, r.table_name), 'id');
    IF seq IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I.%I', r.table_schema, r.table_name)
      INTO max_id;
    IF max_id > 0 THEN
      PERFORM setval(seq, max_id, true);
    END IF;
  END LOOP;
END $$;
