
-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'cashier');

-- 2. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  username text NOT NULL UNIQUE,
  phone text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
CREATE POLICY "Anyone can read profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update profiles" ON public.profiles FOR UPDATE TO authenticated USING (true);

-- 3. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read user_roles" ON public.user_roles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can insert user_roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can delete user_roles" ON public.user_roles FOR DELETE TO authenticated USING (true);

-- 4. Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Trigger for updated_at on profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
