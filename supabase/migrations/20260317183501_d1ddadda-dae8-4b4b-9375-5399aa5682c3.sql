
-- 1. Customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone_number TEXT UNIQUE NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'Regular' CHECK (customer_type IN ('Regular', 'VIP')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  order_type TEXT NOT NULL DEFAULT 'regular' CHECK (order_type IN ('regular', 'urgent')),
  pickup_method TEXT NOT NULL DEFAULT 'walk-in',
  current_status TEXT NOT NULL DEFAULT 'received' CHECK (current_status IN ('received','washing','drying','ironing','ready-for-pickup','delivered')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partially-paid','paid')),
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  urgent_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  general_notes TEXT DEFAULT '',
  qr_value TEXT,
  employee_id TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Order items
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT '',
  service_type TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  color TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  condition_notes TEXT DEFAULT '',
  special_notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Payments
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Order status history
CREATE TABLE public.order_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by TEXT DEFAULT '',
  note TEXT DEFAULT ''
);

-- 6. Customer notes
CREATE TABLE public.customer_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT ''
);

-- 7. Internal order notes
CREATE TABLE public.internal_order_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT ''
);

-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_order_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow all operations for authenticated users (laundry staff)
-- Customers
CREATE POLICY "Authenticated users can read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customers" ON public.customers FOR DELETE TO authenticated USING (true);

-- Also allow anon for now (no auth built yet)
CREATE POLICY "Anon can read customers" ON public.customers FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert customers" ON public.customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update customers" ON public.customers FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete customers" ON public.customers FOR DELETE TO anon USING (true);

-- Orders
CREATE POLICY "Authenticated users can read orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update orders" ON public.orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete orders" ON public.orders FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon can read orders" ON public.orders FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert orders" ON public.orders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update orders" ON public.orders FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete orders" ON public.orders FOR DELETE TO anon USING (true);

-- Order items
CREATE POLICY "Authenticated users can read order_items" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update order_items" ON public.order_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete order_items" ON public.order_items FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon can read order_items" ON public.order_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert order_items" ON public.order_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update order_items" ON public.order_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete order_items" ON public.order_items FOR DELETE TO anon USING (true);

-- Payments
CREATE POLICY "Authenticated users can read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update payments" ON public.payments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anon can read payments" ON public.payments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert payments" ON public.payments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update payments" ON public.payments FOR UPDATE TO anon USING (true);

-- Order status history
CREATE POLICY "Authenticated users can read order_status_history" ON public.order_status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert order_status_history" ON public.order_status_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon can read order_status_history" ON public.order_status_history FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert order_status_history" ON public.order_status_history FOR INSERT TO anon WITH CHECK (true);

-- Customer notes
CREATE POLICY "Authenticated users can read customer_notes" ON public.customer_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customer_notes" ON public.customer_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete customer_notes" ON public.customer_notes FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon can read customer_notes" ON public.customer_notes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert customer_notes" ON public.customer_notes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can delete customer_notes" ON public.customer_notes FOR DELETE TO anon USING (true);

-- Internal order notes
CREATE POLICY "Authenticated users can read internal_order_notes" ON public.internal_order_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert internal_order_notes" ON public.internal_order_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete internal_order_notes" ON public.internal_order_notes FOR DELETE TO authenticated USING (true);
CREATE POLICY "Anon can read internal_order_notes" ON public.internal_order_notes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert internal_order_notes" ON public.internal_order_notes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can delete internal_order_notes" ON public.internal_order_notes FOR DELETE TO anon USING (true);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX idx_orders_current_status ON public.orders(current_status);
CREATE INDEX idx_orders_order_number ON public.orders(order_number);
CREATE INDEX idx_orders_qr_value ON public.orders(qr_value);
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_payments_order_id ON public.payments(order_id);
CREATE INDEX idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX idx_customer_notes_customer_id ON public.customer_notes(customer_id);
CREATE INDEX idx_internal_order_notes_order_id ON public.internal_order_notes(order_id);
CREATE INDEX idx_customers_phone ON public.customers(phone_number);
