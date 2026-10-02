-- Images pasted or dropped into pages and agent chats.
-- Files live in a private bucket under `<workspace_id>/<note|chat>/<id>.<ext>`;
-- the markdown / chat message only holds the reference
-- `cotenk-image:<path>`. Access follows workspace membership.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists note_images_select on storage.objects;
drop policy if exists note_images_insert on storage.objects;
drop policy if exists note_images_delete on storage.objects;

create policy note_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'note-images'
    and public.can_read_workspace(((storage.foldername(name))[1])::uuid)
  );
create policy note_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-images'
    and public.can_write_workspace(((storage.foldername(name))[1])::uuid)
  );
create policy note_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-images'
    and public.can_write_workspace(((storage.foldername(name))[1])::uuid)
  );
