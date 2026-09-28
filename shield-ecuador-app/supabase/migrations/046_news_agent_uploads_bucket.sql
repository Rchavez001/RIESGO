-- Private staging bucket for admin-uploaded documents (md/txt/pdf/docx/
-- images) that quiz-generator reads, extracts text/images from, and feeds
-- into the same AI provider chain the news agent already uses. Private
-- (not public like campaign-ads) since these are raw uploaded documents,
-- not something ever served to students — only the central-admin-app's
-- service-role proxy and quiz-generator (also service_role) ever touch it.
INSERT INTO storage.buckets (id, name, public)
VALUES ('news-agent-uploads', 'news-agent-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- No anon/authenticated policies are created — service_role bypasses RLS
-- entirely, and that's the only role that ever accesses this bucket.
