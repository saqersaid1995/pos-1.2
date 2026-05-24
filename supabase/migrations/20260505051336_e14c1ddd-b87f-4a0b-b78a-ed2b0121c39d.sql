-- Cash transfers between Cash (1010) and Bank (1020)
CREATE TABLE IF NOT EXISTS public.cash_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  from_account text NOT NULL CHECK (from_account IN ('cash','bank')),
  to_account text NOT NULL CHECK (to_account IN ('cash','bank')),
  amount numeric NOT NULL CHECK (amount > 0),
  notes text DEFAULT '',
  created_by text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_account <> to_account)
);

ALTER TABLE public.cash_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cash_transfers" ON public.cash_transfers
  FOR SELECT USING (true);
CREATE POLICY "Admins can insert cash_transfers" ON public.cash_transfers
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete cash_transfers" ON public.cash_transfers
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger: post / reverse JE on insert/delete
CREATE OR REPLACE FUNCTION public.trg_cash_transfer_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  je_id uuid;
  from_acc uuid;
  to_acc uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_system_entries('cash_transfer', OLD.id);
    RETURN OLD;
  END IF;

  from_acc := public.get_account_id(public.payment_method_to_account_code(NEW.from_account));
  to_acc   := public.get_account_id(public.payment_method_to_account_code(NEW.to_account));
  IF from_acc IS NULL OR to_acc IS NULL THEN
    RAISE EXCEPTION 'Cash/Bank account not found in Chart of Accounts';
  END IF;

  INSERT INTO public.journal_entries (entry_date, source_type, source_id, description, is_system)
  VALUES (NEW.transfer_date, 'cash_transfer', NEW.id,
          'Transfer: ' || NEW.from_account || ' → ' || NEW.to_account ||
          CASE WHEN COALESCE(NEW.notes,'') <> '' THEN ' (' || NEW.notes || ')' ELSE '' END,
          true)
  RETURNING id INTO je_id;

  INSERT INTO public.journal_entry_lines (entry_id, debit_account_id, amount, line_description)
  VALUES (je_id, to_acc, NEW.amount, 'Transfer in (' || NEW.to_account || ')');
  INSERT INTO public.journal_entry_lines (entry_id, credit_account_id, amount, line_description)
  VALUES (je_id, from_acc, NEW.amount, 'Transfer out (' || NEW.from_account || ')');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cash_transfer_changed ON public.cash_transfers;
CREATE TRIGGER cash_transfer_changed
AFTER INSERT OR DELETE ON public.cash_transfers
FOR EACH ROW EXECUTE FUNCTION public.trg_cash_transfer_changed();