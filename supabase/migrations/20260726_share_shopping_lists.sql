-- Add family_id to shopping_lists for sharing with family
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES families(id) ON DELETE SET NULL;

-- Update RLS: SELECT allows own lists OR family-shared lists
DROP POLICY IF EXISTS "Users select own shopping lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users can view their shopping lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users select shopping lists" ON shopping_lists;

CREATE POLICY "Users select shopping lists" ON shopping_lists
FOR SELECT USING (
  user_id = auth.uid()
  OR (family_id IS NOT NULL AND family_id IN (
    SELECT family_id FROM family_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
);

-- UPDATE: owner can always update; family members can update shared lists
DROP POLICY IF EXISTS "Users update own shopping lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users can update their shopping lists" ON shopping_lists;
DROP POLICY IF EXISTS "Users update shopping lists" ON shopping_lists;

CREATE POLICY "Users update shopping lists" ON shopping_lists
FOR UPDATE USING (
  user_id = auth.uid()
  OR (family_id IS NOT NULL AND family_id IN (
    SELECT family_id FROM family_members
    WHERE user_id = auth.uid() AND status = 'active'
  ))
);

-- shopping_items: SELECT based on visible lists
DROP POLICY IF EXISTS "Users select own shopping items" ON shopping_items;
DROP POLICY IF EXISTS "Users can view their shopping items" ON shopping_items;
DROP POLICY IF EXISTS "Users select shopping items" ON shopping_items;

CREATE POLICY "Users select shopping items" ON shopping_items
FOR SELECT USING (
  list_id IN (
    SELECT id FROM shopping_lists WHERE
      user_id = auth.uid()
      OR (family_id IS NOT NULL AND family_id IN (
        SELECT family_id FROM family_members
        WHERE user_id = auth.uid() AND status = 'active'
      ))
  )
);

-- shopping_items: INSERT into any visible list
DROP POLICY IF EXISTS "Users insert own shopping items" ON shopping_items;
DROP POLICY IF EXISTS "Users can insert their shopping items" ON shopping_items;
DROP POLICY IF EXISTS "Users insert shopping items" ON shopping_items;

CREATE POLICY "Users insert shopping items" ON shopping_items
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND list_id IN (
    SELECT id FROM shopping_lists WHERE
      user_id = auth.uid()
      OR (family_id IS NOT NULL AND family_id IN (
        SELECT family_id FROM family_members
        WHERE user_id = auth.uid() AND status = 'active'
      ))
  )
);

-- shopping_items: UPDATE any item in a visible list
DROP POLICY IF EXISTS "Users update own shopping items" ON shopping_items;
DROP POLICY IF EXISTS "Users can update their shopping items" ON shopping_items;
DROP POLICY IF EXISTS "Users update shopping items" ON shopping_items;

CREATE POLICY "Users update shopping items" ON shopping_items
FOR UPDATE USING (
  list_id IN (
    SELECT id FROM shopping_lists WHERE
      user_id = auth.uid()
      OR (family_id IS NOT NULL AND family_id IN (
        SELECT family_id FROM family_members
        WHERE user_id = auth.uid() AND status = 'active'
      ))
  )
);
