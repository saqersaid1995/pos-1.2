# WhatsApp Dashboard — Full Ops View

Transforms the current "Connection" tab into a comprehensive WhatsApp dashboard with KPIs, analytics, cost tracking, and error insights, while preserving existing connection-health functionality.

---

## 1. Database Changes

### Extend `notification_logs` (outgoing send log)
Add nullable columns (backfill safe):
- `direction text default 'outgoing'`
- `template_name text`
- `template_language text`
- `template_category text` (utility | marketing | service | authentication)
- `event_type text` (event_order_ready | event_payment_reminder | …)
- `error_code text`
- `delivered_at timestamptz`
- `read_at timestamptz`
- `failed_at timestamptz`
- `estimated_cost numeric default 0`
- `currency text default 'OMR'`

Existing `send_status` already covers pending/sent/delivered/read/failed.

### Extend `whatsapp_messages` (incoming + outgoing chat messages)
Confirm/add: `direction` (incoming/outgoing), `status`, `provider_message_id`, `error_code`, `error_message`, `estimated_cost`, `currency`, timestamp fields. Add only what's missing.

### Extend `whatsapp_settings` with cost config (jsonb):
```json
"cost_rates": {
  "utility": 0.005,
  "marketing": 0.025,
  "service": 0.000,
  "authentication": 0.005,
  "default": 0.005,
  "currency": "OMR",
  "outstanding_unpaid": 0
}
```
Plus `outstanding_unpaid_cost numeric default 0` (admin-set estimated unpaid balance to Meta).

### Backfill
On migration: set `direction='outgoing'`, derive `template_name`/`event_type` from existing `message_type` mapping where possible.

### Webhook (`whatsapp-webhook`)
Update to write `delivered_at` / `read_at` / `failed_at` / `error_code` on status callbacks (matched via `provider_message_id`).

### Send functions (`send-whatsapp`, `send-whatsapp-image`, `send-whatsapp-loyalty`, `send-whatsapp-text`)
Populate new fields when inserting `notification_logs`:
- `template_name`, `template_language`, `template_category` (read from `whatsapp_settings.templates` mapping)
- `event_type` (passed from caller or inferred from `message_type`)
- `estimated_cost` = lookup from `whatsapp_settings.cost_rates[category]` × 1 message

---

## 2. Edge Function `whatsapp-admin` — new actions

- `dashboard_stats` — input: `{ from, to }`, output:
  - KPI counts (sent/delivered/read/failed/pending, incoming/outgoing, total)
  - delivery rate %
  - estimated period cost (sum of `estimated_cost` in window)
  - month-to-date cost
  - outstanding cost (from settings)
  - status breakdown with %
  - daily series (date, sent, failed, cost)
  - template usage table (name/lang/event/sent/delivered/failed/rate/cost)
  - error groups (code, count, last_occurrence, sample message)
  - latest failures (last 20 with phone/template/error)
  - insights (top template, top failure template, top recipient, last success/failure/incoming)
- `retry_failed_message` — input: `{ log_id }` re-invokes the original send path with stored params.

---

## 3. Frontend — `WhatsAppSettings.tsx` Connection tab → "Dashboard" tab

New file: `src/components/whatsapp-settings/DashboardTab.tsx` containing:

### Layout
```
[ Connection Health card — compact, 1 row ]
[ Period Filter: Today | This Week | This Month | Last Month | Custom range picker ]

[ KPI Grid 4×2 ]
  Total Sent | Delivered | Failed | Incoming
  Outgoing | Delivery % | Est. Period Cost | Outstanding Cost

[ Status Breakdown card — bar+%]   [ Trends chart — messages/day, failed/day, cost/day (Recharts) ]

[ Template Usage table ]

[ Error Analytics: grouped errors table + Latest failures list with Retry ]

[ Operational Insights card ]
```

### Components used
- `Card`, `Tabs`, shadcn `DateRangePicker` via `Popover + Calendar`
- `Recharts` (`LineChart`, `BarChart`) via existing `ChartContainer`
- `formatOMR` for all costs

### State
- `period`: `'today'|'week'|'month'|'last_month'|'custom'` + `customRange`
- `stats` from `callAdmin('dashboard_stats', { from, to })`
- React Query for caching, 30s stale time
- "Retry" button → `callAdmin('retry_failed_message', { log_id })` then refetch

### Cost Settings sub-card (admin only)
Editable form for `cost_rates` + `outstanding_unpaid_cost`, persisted via `updateSettings`.

### Connection Health (kept)
Reduced to a single status row at top: green/red dot, masked token, display phone, "Test Connection" button. Detailed credentials remain in existing "Credentials" tab.

---

## 4. Renames / Navigation
- Rename current "Connection" tab label → "Dashboard"
- Existing "Logs" tab stays (raw log viewer)
- Existing "Credentials", "Templates", "Country Codes", "Update Secrets" tabs unchanged

---

## 5. Out of Scope
- Real Meta billing API integration (costs remain admin-configurable estimates)
- Per-conversation pricing model details (use template-category flat rates)
- Historical backfill of `delivered_at/read_at` for messages sent before this change

---

## 6. Files

**Create**
- `supabase/migrations/<ts>_whatsapp_dashboard_fields.sql`
- `src/components/whatsapp-settings/DashboardTab.tsx`
- `src/components/whatsapp-settings/CostSettingsCard.tsx`

**Edit**
- `supabase/functions/whatsapp-admin/index.ts` (new actions)
- `supabase/functions/whatsapp-webhook/index.ts` (status timestamps + error_code)
- `supabase/functions/send-whatsapp/index.ts`, `send-whatsapp-image`, `send-whatsapp-loyalty`, `send-whatsapp-text` (populate new fields + estimated_cost)
- `src/lib/whatsapp-settings.ts` (types + helpers for cost_rates and dashboard_stats)
- `src/pages/WhatsAppSettings.tsx` (replace Connection tab content with `DashboardTab`)

Approve to implement.
