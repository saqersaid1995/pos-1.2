UPDATE orders 
SET order_date = '2026-04-05' 
WHERE created_at >= '2026-04-05T00:00:00+00' 
  AND order_date = '2026-04-04'
  AND created_at::time >= '16:00:00';