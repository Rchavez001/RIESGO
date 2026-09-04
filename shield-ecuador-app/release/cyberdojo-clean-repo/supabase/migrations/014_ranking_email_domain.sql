-- supabase/migrations/014_ranking_email_domain.sql
-- Adds email_domain column for ranking by business domain.
-- Users with public email providers (gmail, hotmail, etc.) are excluded from ranking.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email_domain
  ON public.users(email_domain)
  WHERE email_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_ranking
  ON public.users(total_points DESC, id)
  WHERE email_domain IS NOT NULL
    AND email_domain NOT IN (
      'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com',
      'icloud.com', 'aol.com', 'protonmail.com', 'tutanota.com',
      'mail.com', 'msn.com', 'live.com', 'altavista.com',
      'ymail.com', 'zoho.com', 'gmx.com', 'fastmail.com',
      'rediffmail.com', 'rocketmail.com'
    );
