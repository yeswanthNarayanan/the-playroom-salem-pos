// Run this script once to create tables and seed data in Supabase
// Usage: npx tsx scripts/setup-supabase.ts

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupDatabase() {
    console.log('🔧 Setting up Supabase tables...');
    console.log('URL:', supabaseUrl);

    // Create menu_items table via RPC or direct SQL
    // Since we can't run raw SQL with the anon key, we'll use the REST API to create data.
    // The user must create tables via Supabase Dashboard SQL Editor.
    // We'll print the SQL and then seed data.

    const createTableSQL = `
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  total NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_at_time NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable Row Level Security (RLS) but allow all for anon (for POS use)
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON menu_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON order_items FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed initial menu items
INSERT INTO menu_items (name, category, price, is_available) VALUES
  ('Margherita Pizza', 'Main Course', 12.99, true),
  ('Caesar Salad', 'Starters', 8.50, true),
  ('Garlic Bread', 'Starters', 4.99, true),
  ('Coke', 'Beverages', 2.50, true),
  ('Iced Tea', 'Beverages', 3.00, true),
  ('Pasta Carbonara', 'Main Course', 14.99, true);
`;

    console.log('\n📋 Please run the following SQL in your Supabase Dashboard SQL Editor:\n');
    console.log('='.repeat(70));
    console.log(createTableSQL);
    console.log('='.repeat(70));

    // Try to check if tables already exist by querying them
    console.log('\n🔍 Checking if tables already exist...');

    const { data: menuCheck, error: menuError } = await supabase
        .from('menu_items')
        .select('id')
        .limit(1);

    if (menuError) {
        console.log('❌ menu_items table does not exist yet. Please run the SQL above first.');
        console.log('   Error:', menuError.message);
    } else {
        console.log('✅ menu_items table exists!', menuCheck?.length ? `(${menuCheck.length} items found)` : '(empty)');

        // Seed if empty
        if (menuCheck?.length === 0) {
            console.log('🌱 Seeding menu items...');
            const { error: seedError } = await supabase.from('menu_items').insert([
                { name: 'Margherita Pizza', category: 'Main Course', price: 12.99, is_available: true },
                { name: 'Caesar Salad', category: 'Starters', price: 8.50, is_available: true },
                { name: 'Garlic Bread', category: 'Starters', price: 4.99, is_available: true },
                { name: 'Coke', category: 'Beverages', price: 2.50, is_available: true },
                { name: 'Iced Tea', category: 'Beverages', price: 3.00, is_available: true },
                { name: 'Pasta Carbonara', category: 'Main Course', price: 14.99, is_available: true },
            ]);
            if (seedError) {
                console.log('❌ Failed to seed:', seedError.message);
            } else {
                console.log('✅ Seeded 6 menu items!');
            }
        }
    }

    const { data: ordersCheck, error: ordersError } = await supabase
        .from('orders')
        .select('id')
        .limit(1);

    if (ordersError) {
        console.log('❌ orders table does not exist yet.');
    } else {
        console.log('✅ orders table exists!');
    }

    const { data: orderItemsCheck, error: orderItemsError } = await supabase
        .from('order_items')
        .select('id')
        .limit(1);

    if (orderItemsError) {
        console.log('❌ order_items table does not exist yet.');
    } else {
        console.log('✅ order_items table exists!');
    }
}

setupDatabase().catch(console.error);
