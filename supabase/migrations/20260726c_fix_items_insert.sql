-- La política compleja de INSERT en shopping_items genera conflicto con la simple.
-- Dejamos solo la simple: cualquier usuario autenticado puede insertar sus propios items.
DROP POLICY IF EXISTS "Users insert shopping items" ON shopping_items;
