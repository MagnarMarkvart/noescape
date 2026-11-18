-- Idempotent migration script for Lists titleNormalized column and unique constraint
-- This script can be run multiple times safely

-- Step 1: Add titleNormalized column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ListItemMemory' 
        AND column_name = 'titleNormalized'
    ) THEN
        ALTER TABLE "ListItemMemory" 
        ADD COLUMN "titleNormalized" TEXT;
        
        RAISE NOTICE 'Added titleNormalized column';
    ELSE
        RAISE NOTICE 'titleNormalized column already exists';
    END IF;
END $$;

-- Step 2: Backfill titleNormalized with lower(trim(title)) for any NULL values
UPDATE "ListItemMemory"
SET "titleNormalized" = lower(btrim(title))
WHERE "titleNormalized" IS NULL;

-- Step 3: Handle duplicates - keep the one with highest useCount and latest lastUsedAt
-- For each duplicate group, update the keeper (MIN id) with MAX values, then delete the rest
DO $$
DECLARE
    dup_record RECORD;
BEGIN
    FOR dup_record IN 
        SELECT 
            "listId", 
            "titleNormalized",
            MAX("useCount") as max_use_count,
            MAX("lastUsedAt") as max_last_used_at,
            MIN(id) as keeper_id
        FROM "ListItemMemory"
        GROUP BY "listId", "titleNormalized"
        HAVING COUNT(*) > 1
    LOOP
        -- Update the keeper with the max values from all duplicates
        UPDATE "ListItemMemory"
        SET 
            "useCount" = dup_record.max_use_count,
            "lastUsedAt" = dup_record.max_last_used_at
        WHERE id = dup_record.keeper_id;
        
        -- Delete all other rows in this duplicate group
        DELETE FROM "ListItemMemory"
        WHERE "listId" = dup_record."listId"
          AND "titleNormalized" = dup_record."titleNormalized"
          AND id != dup_record.keeper_id;
          
        RAISE NOTICE 'Merged duplicates for listId=%, titleNormalized=% (kept id=%)',
            dup_record."listId", dup_record."titleNormalized", dup_record.keeper_id;
    END LOOP;
END $$;

-- Step 4: Set NOT NULL constraint if not already set
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ListItemMemory' 
        AND column_name = 'titleNormalized'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE "ListItemMemory" 
        ALTER COLUMN "titleNormalized" SET NOT NULL;
        
        RAISE NOTICE 'Set titleNormalized NOT NULL';
    ELSE
        RAISE NOTICE 'titleNormalized already NOT NULL';
    END IF;
END $$;

-- Step 5: Drop old unique constraint if it exists
DO $$
BEGIN
    -- Try to drop the constraint, ignore if it doesn't exist
    BEGIN
        ALTER TABLE "ListItemMemory" 
        DROP CONSTRAINT IF EXISTS "ListItemMemory_listId_title_key";
        
        RAISE NOTICE 'Dropped old ListItemMemory_listId_title_key constraint (if it existed)';
    EXCEPTION
        WHEN undefined_object THEN
            RAISE NOTICE 'Old constraint ListItemMemory_listId_title_key does not exist';
    END;
END $$;

-- Step 6: Create new unique constraint with Prisma's naming convention if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ListItemMemory_listId_titleNormalized_key'
        AND conrelid = '"ListItemMemory"'::regclass
    ) THEN
        ALTER TABLE "ListItemMemory" 
        ADD CONSTRAINT "ListItemMemory_listId_titleNormalized_key" 
        UNIQUE ("listId", "titleNormalized");
        
        RAISE NOTICE 'Created new ListItemMemory_listId_titleNormalized_key constraint';
    ELSE
        RAISE NOTICE 'Constraint ListItemMemory_listId_titleNormalized_key already exists';
    END IF;
END $$;
