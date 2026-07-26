-- market_stores: "categorías" = places where you shop
CREATE TABLE IF NOT EXISTS market_stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🛒',
  color TEXT NOT NULL DEFAULT '#3B82F6',
  sort_order INT NOT NULL DEFAULT 0,
  is_family BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE market_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_stores_select" ON market_stores FOR SELECT USING (
  user_id = auth.uid()
  OR (is_family = true AND family_id IS NOT NULL AND family_id IN (
    SELECT family_id FROM family_members WHERE user_id = auth.uid() AND status = 'active'
  ))
);
CREATE POLICY "market_stores_insert" ON market_stores
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "market_stores_update" ON market_stores
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "market_stores_delete" ON market_stores
  FOR DELETE USING (user_id = auth.uid());

-- market_products: master product catalog per store
CREATE TABLE IF NOT EXISTS market_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  store_id UUID REFERENCES market_stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'und',
  is_family BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE market_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_products_select" ON market_products FOR SELECT USING (
  user_id = auth.uid()
  OR (is_family = true AND family_id IS NOT NULL AND family_id IN (
    SELECT family_id FROM family_members WHERE user_id = auth.uid() AND status = 'active'
  ))
);
CREATE POLICY "market_products_insert" ON market_products
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "market_products_update" ON market_products
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "market_products_delete" ON market_products
  FOR DELETE USING (user_id = auth.uid());

-- Link shopping_items to the catalog
ALTER TABLE shopping_items
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES market_stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES market_products(id) ON DELETE SET NULL;
