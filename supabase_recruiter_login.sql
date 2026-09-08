-- =========================================
-- Hirezone — Recruiter Login Setup (Supabase)
-- Run this in Supabase > SQL Editor
-- =========================================

-- 1) Enable pgcrypto for secure password hashing
-- On Supabase pgcrypto lives in `extensions` schema, not `public`
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto; -- fallback if your instance uses public

-- 2) Ensure recruiters table has password_hash column
--    If your table already has a plain `password` column, you can keep it,
--    but password_hash is RECOMMENDED (bcrypt).
alter table public.recruiters
  add column if not exists password_hash text;

-- Optional: also keep email if not exists (useful for display)
alter table public.recruiters
  add column if not exists email text;

-- Optional: ensure company_name exists
alter table public.recruiters
  add column if not exists company_name text;

-- 3) Backfill existing recruiters with a password hash
--    Change 'hirezone123' to your desired password per recruiter
--    Example: set password for recruiter 104 (NVIDIA)
-- Use extensions schema explicitly (Supabase default)
update public.recruiters
set password_hash = extensions.crypt('hirezone123', extensions.gen_salt('bf'))
where recruiter_id = 104;

-- If extensions.crypt fails, try public schema fallback:
-- update public.recruiters set password_hash = public.crypt('hirezone123', public.gen_salt('bf')) where recruiter_id = 104;
-- Or generic: update public.recruiters set password_hash = crypt('hirezone123', gen_salt('bf')) where recruiter_id = 104;

-- If you have more recruiters, set each:
-- update public.recruiters set password_hash = extensions.crypt('pass_for_105', extensions.gen_salt('bf')) where recruiter_id = 105;

-- 4) Create secure login function (SECURITY DEFINER so anon can call it without seeing hashes)
-- FIX: recruiters.recruiter_id is bigint (int8), so function must use bigint not int
-- If you already created the int version, drop it first:
drop function if exists public.verify_recruiter_login(int, text);
drop function if exists public.verify_recruiter_login(bigint, text);

create or replace function public.verify_recruiter_login(
  p_recruiter_id bigint,
  p_password text
)
returns table (
  recruiter_id bigint,
  company_name text,
  email text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select r.recruiter_id, r.company_name::text, r.email::text
  from public.recruiters r
  where r.recruiter_id = p_recruiter_id
    and r.password_hash is not null
    and r.password_hash = extensions.crypt(p_password, r.password_hash);
end;
$$;

-- 5) Allow anon / authenticated to execute the function
grant execute on function public.verify_recruiter_login(bigint, text) to anon, authenticated;

-- 6) Lock down direct access to password_hash
--    Recommended: revoke direct select on recruiters for anon, rely only on RPC for login.
--    But if you already have RLS policies allowing read, add this to hide hash:
--    Option A: Create a view without password_hash for public reads
create or replace view public.recruiters_public as
select recruiter_id, company_name, email
from public.recruiters;

grant select on public.recruiters_public to anon, authenticated;

--    Option B: If using RLS on recruiters, ensure policy does NOT expose password_hash.
--    Example RLS (enable if not enabled):
-- alter table public.recruiters enable row level security;
-- create policy "Allow login via RPC only" on public.recruiters for select to anon, authenticated using (false);
-- Then allow RPC (security definer) to bypass RLS — no extra policy needed for RPC.

-- 7) Test the login (should return 1 row if correct)
-- select * from public.verify_recruiter_login(104, 'hirezone123'); -- should succeed
-- select * from public.verify_recruiter_login(104, 'wrong');       -- should return 0 rows

-- =========================================
-- ALTERNATIVE QUICK DEMO (INSECURE, NOT RECOMMENDED FOR PROD)
-- If you want plain text password column for quick testing:
-- =========================================
-- alter table public.recruiters add column if not exists password text;
-- update public.recruiters set password = 'hirezone123' where recruiter_id = 104;
-- Then frontend fallback will also work (direct eq on password column), but prefer the hashed version above.
