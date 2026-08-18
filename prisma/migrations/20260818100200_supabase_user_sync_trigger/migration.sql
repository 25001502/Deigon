-- Sync new Supabase Auth users (auth.users) into the application profile table (public."User").
-- SECURITY DEFINER lets the trigger write to public."User" regardless of the inserting role.
-- role is hard-coded to 'CUSTOMER' so a signup request can never grant itself ADMIN;
-- ADMIN is only ever assigned later via trusted server-side/admin operations.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."User" (id, email, name, role, "createdAt", "updatedAt")
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      NEW.raw_user_meta_data ->> 'display_name'
    ),
    'CUSTOMER'::"UserRole",
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
