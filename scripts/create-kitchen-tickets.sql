-- ============================================================================
-- BillWise POS: Kitchen Tickets table + Atomic RPC functions
-- Run this ENTIRE SQL in your Supabase SQL Editor
-- ============================================================================

-- 1. Create the kitchen_tickets table (safe to re-run)
CREATE TABLE IF NOT EXISTS kitchen_tickets (
    id          TEXT PRIMARY KEY,
    items       JSONB NOT NULL DEFAULT '[]',
    status      TEXT NOT NULL DEFAULT 'pending',
    prepared_items JSONB DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Row Level Security
ALTER TABLE kitchen_tickets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Allow all for anon" ON kitchen_tickets FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Enable Realtime (safe — skips if already enabled)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'kitchen_tickets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE kitchen_tickets;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'menu_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;
END $$;

-- ============================================================================
-- ATOMIC RPC FUNCTIONS — prevent data collision between concurrent waiters
-- Each locks the row with FOR UPDATE so concurrent edits queue, not overwrite.
-- ============================================================================

-- add_ticket_item: Atomically add an item or increment its qty
CREATE OR REPLACE FUNCTION add_ticket_item(
    p_ticket_id TEXT,
    p_item_id TEXT,
    p_item_name TEXT,
    p_item_price NUMERIC,
    p_quantity INT DEFAULT 1
) RETURNS VOID AS $$
DECLARE
    current_items JSONB;
    item_exists BOOLEAN;
    updated_items JSONB;
BEGIN
    INSERT INTO kitchen_tickets (id, items, status, updated_at)
    VALUES (p_ticket_id, '[]'::jsonb, 'pending', now())
    ON CONFLICT (id) DO NOTHING;

    SELECT items INTO current_items
    FROM kitchen_tickets WHERE id = p_ticket_id FOR UPDATE;

    SELECT EXISTS(
        SELECT 1 FROM jsonb_array_elements(current_items) elem
        WHERE elem->>'id' = p_item_id
    ) INTO item_exists;

    IF item_exists THEN
        SELECT jsonb_agg(
            CASE WHEN elem->>'id' = p_item_id
            THEN jsonb_set(elem, '{quantity}', to_jsonb((elem->>'quantity')::int + p_quantity))
            ELSE elem END
        ) INTO updated_items
        FROM jsonb_array_elements(current_items) elem;
    ELSE
        updated_items := current_items || jsonb_build_array(
            jsonb_build_object('id', p_item_id, 'name', p_item_name, 'price', p_item_price, 'quantity', p_quantity)
        );
    END IF;

    UPDATE kitchen_tickets SET items = updated_items, status = 'pending', updated_at = now()
    WHERE id = p_ticket_id;
END;
$$ LANGUAGE plpgsql;

-- remove_ticket_item: Atomically remove an item; deletes ticket if empty
CREATE OR REPLACE FUNCTION remove_ticket_item(
    p_ticket_id TEXT,
    p_item_id TEXT
) RETURNS VOID AS $$
DECLARE
    current_items JSONB;
    updated_items JSONB;
BEGIN
    SELECT items INTO current_items
    FROM kitchen_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF current_items IS NULL THEN RETURN; END IF;

    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO updated_items
    FROM jsonb_array_elements(current_items) elem
    WHERE elem->>'id' != p_item_id;

    IF updated_items = '[]'::jsonb THEN
        DELETE FROM kitchen_tickets WHERE id = p_ticket_id;
    ELSE
        UPDATE kitchen_tickets SET items = updated_items, updated_at = now()
        WHERE id = p_ticket_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- update_ticket_item_qty: Atomically set qty; removes item if qty <= 0
CREATE OR REPLACE FUNCTION update_ticket_item_qty(
    p_ticket_id TEXT,
    p_item_id TEXT,
    p_quantity INT
) RETURNS VOID AS $$
DECLARE
    current_items JSONB;
    updated_items JSONB;
BEGIN
    SELECT items INTO current_items
    FROM kitchen_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF current_items IS NULL THEN RETURN; END IF;

    IF p_quantity <= 0 THEN
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO updated_items
        FROM jsonb_array_elements(current_items) elem
        WHERE elem->>'id' != p_item_id;
    ELSE
        SELECT jsonb_agg(
            CASE WHEN elem->>'id' = p_item_id
            THEN jsonb_set(elem, '{quantity}', to_jsonb(p_quantity))
            ELSE elem END
        ) INTO updated_items
        FROM jsonb_array_elements(current_items) elem;
    END IF;

    IF updated_items = '[]'::jsonb THEN
        DELETE FROM kitchen_tickets WHERE id = p_ticket_id;
    ELSE
        UPDATE kitchen_tickets SET items = updated_items, status = 'pending', updated_at = now()
        WHERE id = p_ticket_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
