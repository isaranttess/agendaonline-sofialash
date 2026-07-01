
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Services
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 120,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active services" ON public.services
  FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage services" ON public.services
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Business hours (day_of_week: 0=Sunday .. 6=Saturday)
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day_of_week)
);
GRANT SELECT ON public.business_hours TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.business_hours TO authenticated;
GRANT ALL ON public.business_hours TO service_role;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view hours" ON public.business_hours FOR SELECT USING (true);
CREATE POLICY "Admins manage hours" ON public.business_hours
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Blocked dates
CREATE TABLE public.blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blocked_dates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.blocked_dates TO authenticated;
GRANT ALL ON public.blocked_dates TO service_role;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view blocked dates" ON public.blocked_dates FOR SELECT USING (true);
CREATE POLICY "Admins manage blocked dates" ON public.blocked_dates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Appointments
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appointments_date_idx ON public.appointments(appointment_date, status);
GRANT SELECT, INSERT ON public.appointments TO anon, authenticated;
GRANT UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
-- Public can insert (booking) and read only booked slots (needed to hide taken times). We expose only time fields via app queries.
CREATE POLICY "Anyone can create appointment" ON public.appointments FOR INSERT WITH CHECK (status = 'confirmed');
CREATE POLICY "Anyone can view confirmed slots" ON public.appointments FOR SELECT USING (status = 'confirmed');
CREATE POLICY "Admins manage appointments" ON public.appointments
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed services
INSERT INTO public.services (name, price, duration_minutes, sort_order) VALUES
  ('Volume brasileiro', 100, 120, 1),
  ('Volume egípcio', 120, 120, 2),
  ('Volume gringo', 120, 120, 3),
  ('Volume luxo', 130, 120, 4),
  ('Volume russo', 150, 120, 5),
  ('Efeito rímel', 100, 120, 6),
  ('Efeito fox', 120, 120, 7),
  ('Efeito coreano', 135, 120, 8),
  ('Efeito anime', 135, 120, 9),
  ('Mega brasileiro (capping)', 140, 120, 10),
  ('Efeito luxúria (capping)', 150, 120, 11);

-- Seed business hours: Tue-Sat 9-18, Sun/Mon closed
INSERT INTO public.business_hours (day_of_week, open_time, close_time, is_open) VALUES
  (0, '09:00', '18:00', false),
  (1, '09:00', '18:00', false),
  (2, '09:00', '18:00', true),
  (3, '09:00', '18:00', true),
  (4, '09:00', '18:00', true),
  (5, '09:00', '18:00', true),
  (6, '09:00', '18:00', true);

-- Trigger to auto-assign admin role to first user
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created_role AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
