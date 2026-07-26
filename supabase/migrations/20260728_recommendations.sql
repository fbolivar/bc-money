-- Recommendation engine: analyzes completed shopping lists to suggest products.
-- Returns for each product in a store: purchase frequency, presence in last list,
-- and co-occurrence count with currently selected products.
CREATE OR REPLACE FUNCTION get_store_recommendations(
  p_store_id         UUID,
  p_all_selected_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TABLE (
  product_id   UUID,
  frequency    BIGINT,
  in_last_list BOOLEAN,
  co_occurrence BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH
  -- How many completed lists contain each product in this store
  freq AS (
    SELECT si.product_id, COUNT(DISTINCT si.list_id)::BIGINT AS cnt
    FROM shopping_items si
    JOIN shopping_lists sl ON si.list_id = sl.id
    WHERE sl.user_id    = auth.uid()
      AND sl.status     = 'completed'
      AND si.store_id   = p_store_id
      AND si.product_id IS NOT NULL
    GROUP BY si.product_id
  ),
  -- Most recent completed list
  last_list AS (
    SELECT id FROM shopping_lists
    WHERE user_id = auth.uid() AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  -- Products that were in the last list (same store)
  last_items AS (
    SELECT DISTINCT si.product_id
    FROM shopping_items si
    WHERE si.list_id    = (SELECT id FROM last_list)
      AND si.store_id   = p_store_id
      AND si.product_id IS NOT NULL
  ),
  -- Products in this store that appear in the same lists as any currently selected product
  co_occ AS (
    SELECT si2.product_id, COUNT(DISTINCT si2.list_id)::BIGINT AS co_cnt
    FROM shopping_items si1
    JOIN shopping_items si2
      ON si1.list_id       = si2.list_id
     AND si1.product_id   != si2.product_id
    JOIN shopping_lists sl ON si1.list_id = sl.id
    WHERE sl.user_id      = auth.uid()
      AND sl.status       = 'completed'
      AND si1.product_id  = ANY(p_all_selected_ids)
      AND si2.store_id    = p_store_id
      AND si2.product_id  IS NOT NULL
    GROUP BY si2.product_id
  )
  SELECT
    p.id                                AS product_id,
    COALESCE(f.cnt, 0)                  AS frequency,
    (li.product_id IS NOT NULL)         AS in_last_list,
    COALESCE(c.co_cnt, 0)               AS co_occurrence
  FROM market_products p
  LEFT JOIN freq       f  ON f.product_id  = p.id
  LEFT JOIN last_items li ON li.product_id = p.id
  LEFT JOIN co_occ     c  ON c.product_id  = p.id
  WHERE p.store_id = p_store_id
    AND (
          COALESCE(f.cnt, 0)    > 0
       OR li.product_id IS NOT NULL
       OR COALESCE(c.co_cnt, 0) > 0
    )
  ORDER BY (
    COALESCE(f.cnt, 0)    * 3
    + COALESCE(c.co_cnt, 0) * 2
    + CASE WHEN li.product_id IS NOT NULL THEN 1 ELSE 0 END
  ) DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION get_store_recommendations(UUID, UUID[]) TO authenticated;
