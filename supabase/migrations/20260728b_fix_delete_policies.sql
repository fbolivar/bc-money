-- Fix: missing DELETE policies for shopping_lists and shopping_items.
-- Without these, users cannot delete their own lists or items (silent block).
-- Family members can only delete lists/items they own, not shared ones.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'shopping_lists'
        AND policyname = 'Users delete own shopping lists'
    ) THEN
        CREATE POLICY "Users delete own shopping lists" ON shopping_lists
            FOR DELETE USING (user_id = auth.uid());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'shopping_items'
        AND policyname = 'Users delete own shopping items'
    ) THEN
        CREATE POLICY "Users delete own shopping items" ON shopping_items
            FOR DELETE USING (user_id = auth.uid());
    END IF;
END $$;
