
-- Fixed weekly slot templates
CREATE TABLE public.weekly_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_of_week, slot_time)
);
GRANT SELECT ON public.weekly_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_slots TO authenticated;
GRANT ALL ON public.weekly_slots TO service_role;
ALTER TABLE public.weekly_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view weekly slots" ON public.weekly_slots FOR SELECT USING (true);
CREATE POLICY "Admins manage weekly slots" ON public.weekly_slots FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Per-date slot overrides (disable specific slot on specific date)
CREATE TABLE public.slot_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  is_disabled boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_date, slot_time)
);
GRANT SELECT ON public.slot_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slot_overrides TO authenticated;
GRANT ALL ON public.slot_overrides TO service_role;
ALTER TABLE public.slot_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view slot overrides" ON public.slot_overrides FOR SELECT USING (true);
CREATE POLICY "Admins manage slot overrides" ON public.slot_overrides FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Cancellation tracking on appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_notified boolean NOT NULL DEFAULT false;

-- Seed weekly slot templates
-- Mon-Fri (1..5): 11:00, 14:00, 15:30, 17:00
INSERT INTO public.weekly_slots (day_of_week, slot_time)
SELECT d, t FROM generate_series(1,5) d
CROSS JOIN (VALUES ('11:00'::time), ('14:00'::time), ('15:30'::time), ('17:00'::time)) v(t)
ON CONFLICT DO NOTHING;

-- Saturday (6)
INSERT INTO public.weekly_slots (day_of_week, slot_time) VALUES
  (6, '08:30'), (6, '10:00'), (6, '13:00'), (6, '14:30'),
  (6, '16:00'), (6, '17:30'), (6, '19:00')
ON CONFLICT DO NOTHING;

-- Update service durations (russo and luxúria = 90; others 120)
UPDATE public.services SET duration_minutes = 90
  WHERE lower(name) LIKE '%russo%' OR lower(name) LIKE '%luxúria%' OR lower(name) LIKE '%luxuria%';
UPDATE public.services SET duration_minutes = 120
  WHERE NOT (lower(name) LIKE '%russo%' OR lower(name) LIKE '%luxúria%' OR lower(name) LIKE '%luxuria%');

-- Align business_hours: Sunday closed, Mon-Sat open (kept for compat)
UPDATE public.business_hours SET is_open = false WHERE day_of_week = 0;
UPDATE public.business_hours SET is_open = true WHERE day_of_week BETWEEN 1 AND 6;
