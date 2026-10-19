-- Uploads to the thumbnails bucket use upsert and read the row back, which needs a SELECT policy.
-- Without it the upload fails with "new row violates row-level security policy".
drop policy if exists thumbnails_select on storage.objects;
create policy thumbnails_select on storage.objects for select to authenticated
  using (bucket_id = 'thumbnails' and public.is_uta_user());
