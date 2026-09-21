-- Campaign ads (admin console › Propaganda) are shown to EVERY registered user, so what a campaign row may contain
-- is restricted where it cannot be bypassed: in the database and in the storage bucket.
--  * link_url is rendered as <a href>: only http(s) (a javascript: link would run in the user app);
--  * image_url is rendered as <img src>: only files of our own campaign-ads bucket (no third-party tracking pixels);
--  * the bucket accepted any file type and size — the limits were only checked by the admin page.
ALTER TABLE public.central_admin_campaigns
  ADD CONSTRAINT campaign_link_url_http CHECK (link_url IS NULL OR link_url ~* '^https?://[^[:space:]]+$') NOT VALID,
  ADD CONSTRAINT campaign_image_url_own_bucket CHECK (image_url IS NULL OR image_url LIKE 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/storage/v1/object/public/campaign-ads/%') NOT VALID,
  ADD CONSTRAINT campaign_duration_range CHECK (duration_seconds BETWEEN 1 AND 120) NOT VALID,
  ADD CONSTRAINT campaign_text_length CHECK (char_length(name) <= 120 AND char_length(message) <= 500) NOT VALID,
  ADD CONSTRAINT campaign_donation_period_range CHECK (donation_period_months IS NULL OR donation_period_months <= 120) NOT VALID;
ALTER TABLE public.central_admin_campaigns VALIDATE CONSTRAINT campaign_link_url_http;
ALTER TABLE public.central_admin_campaigns VALIDATE CONSTRAINT campaign_image_url_own_bucket;
ALTER TABLE public.central_admin_campaigns VALIDATE CONSTRAINT campaign_duration_range;
ALTER TABLE public.central_admin_campaigns VALIDATE CONSTRAINT campaign_text_length;
ALTER TABLE public.central_admin_campaigns VALIDATE CONSTRAINT campaign_donation_period_range;

UPDATE storage.buckets
   SET file_size_limit = 1048576,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
 WHERE id = 'campaign-ads';
