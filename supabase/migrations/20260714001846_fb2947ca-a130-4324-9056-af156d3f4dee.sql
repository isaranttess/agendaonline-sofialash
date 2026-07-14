
-- 1. Remove overly permissive public policies exposing PII / unvalidated inserts
DROP POLICY IF EXISTS "Anyone can view confirmed slots" ON public.appointments;
DROP POLICY IF EXISTS "Anyone can create appointment" ON public.appointments;

-- (Admin ALL policy remains, so Sofia can still read/manage everything.)

-- 2. Public availability function: returns only time ranges, no PII
CREATE OR REPLACE FUNCTION public.get_taken_slots(p_date date)
RETURNS TABLE(start_time time, end_time time)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT start_time, end_time
  FROM public.appointments
  WHERE appointment_date = p_date
    AND status = 'confirmed';
$$;

REVOKE ALL ON FUNCTION public.get_taken_slots(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_taken_slots(date) TO anon, authenticated;

-- 3. Validated booking RPC — replaces public INSERT policy
CREATE OR REPLACE FUNCTION public.create_appointment(
  p_service_id uuid,
  p_client_name text,
  p_client_phone text,
  p_date date,
  p_start_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration int;
  v_end_time time;
  v_dow int;
  v_id uuid;
  v_name text;
  v_phone text;
BEGIN
  -- Input sanitation
  v_name  := btrim(coalesce(p_client_name, ''));
  v_phone := btrim(coalesce(p_client_phone, ''));

  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Nome inválido';
  END IF;
  IF length(v_phone) < 8 OR length(v_phone) > 20 THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;

  -- Service must exist and be active
  SELECT duration_minutes INTO v_duration
  FROM public.services
  WHERE id = p_service_id AND is_active = true;
  IF v_duration IS NULL THEN
    RAISE EXCEPTION 'Serviço indisponível';
  END IF;

  -- Date must be today or future
  IF p_date < current_date THEN
    RAISE EXCEPTION 'Data inválida';
  END IF;

  v_end_time := (p_start_time + make_interval(mins => v_duration))::time;
  v_dow := EXTRACT(DOW FROM p_date)::int;

  -- Start time must match the weekly template for that weekday
  IF NOT EXISTS (
    SELECT 1 FROM public.weekly_slots
    WHERE day_of_week = v_dow AND slot_time = p_start_time
  ) THEN
    RAISE EXCEPTION 'Horário indisponível';
  END IF;

  -- Slot must not be manually disabled or the date globally blocked
  IF EXISTS (
    SELECT 1 FROM public.slot_overrides
    WHERE slot_date = p_date AND slot_time = p_start_time AND is_disabled = true
  ) THEN
    RAISE EXCEPTION 'Horário indisponível';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_dates WHERE blocked_date = p_date) THEN
    RAISE EXCEPTION 'Data indisponível';
  END IF;

  -- No overlap with other confirmed appointments
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE appointment_date = p_date
      AND status = 'confirmed'
      AND p_start_time < end_time
      AND v_end_time > start_time
  ) THEN
    RAISE EXCEPTION 'Horário já reservado';
  END IF;

  INSERT INTO public.appointments (
    service_id, client_name, client_phone,
    appointment_date, start_time, end_time, status
  ) VALUES (
    p_service_id, v_name, v_phone,
    p_date, p_start_time, v_end_time, 'confirmed'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(uuid, text, text, date, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, text, text, date, time) TO anon, authenticated;
