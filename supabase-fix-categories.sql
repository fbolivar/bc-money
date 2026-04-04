-- Ejecutar en Supabase SQL Editor: https://supabase.com/dashboard/project/spsyzwpgbjehbttrhauy/sql/new
-- Este script permite a usuarios autenticados editar y eliminar TODAS las categorías (incluidas las de sistema)

-- 1. Eliminar políticas restrictivas existentes de UPDATE y DELETE
DROP POLICY IF EXISTS "Users can update own categories" ON categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON categories;
DROP POLICY IF EXISTS "Users can update categories" ON categories;
DROP POLICY IF EXISTS "Users can delete categories" ON categories;
DROP POLICY IF EXISTS "update_own_categories" ON categories;
DROP POLICY IF EXISTS "delete_own_categories" ON categories;

-- 2. Crear nuevas políticas que permiten editar/eliminar todas las categorías
CREATE POLICY "Users can update categories"
ON categories FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can delete categories"
ON categories FOR DELETE
TO authenticated
USING (true);

-- 3. Verificar que la política de SELECT existe (para ver todas las categorías)
-- Si no existe, crearla:
-- CREATE POLICY "Users can view categories" ON categories FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_system = true);
