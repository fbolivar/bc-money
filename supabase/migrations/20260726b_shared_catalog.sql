-- Catálogo compartido: todos los usuarios autenticados pueden leer todas
-- las tiendas y productos. Cada usuario sigue teniendo su propia lista de compras.

-- market_stores SELECT: visible para todos los autenticados
DROP POLICY IF EXISTS "market_stores_select" ON market_stores;
CREATE POLICY "market_stores_select" ON market_stores
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- market_products SELECT: visible para todos los autenticados
DROP POLICY IF EXISTS "market_products_select" ON market_products;
CREATE POLICY "market_products_select" ON market_products
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- market_products INSERT: cualquier autenticado puede agregar productos
DROP POLICY IF EXISTS "market_products_insert" ON market_products;
CREATE POLICY "market_products_insert" ON market_products
  FOR INSERT WITH CHECK (user_id = auth.uid());
