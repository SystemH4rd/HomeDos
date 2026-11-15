-- Run once in the Supabase SQL Editor. No service key belongs in the website.
begin;
create table if not exists public.orbit_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 workspace jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 constraint orbit_workspace_size check (octet_length(workspace::text) <= 10485760),
 constraint orbit_workspace_shape check (workspace->>'version' = '1' and jsonb_typeof(workspace->'boards') = 'array')
);
alter table public.orbit_workspaces enable row level security;
revoke all on public.orbit_workspaces from anon, authenticated;
grant select on public.orbit_workspaces to authenticated;
drop policy if exists "Read own workspace" on public.orbit_workspaces;
create policy "Read own workspace" on public.orbit_workspaces for select to authenticated using ((select auth.uid()) = user_id);
-- Atomic compare-and-swap prevents a stale browser from overwriting newer data.
create or replace function public.orbit_save_workspace(p_workspace jsonb, p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); next_revision bigint;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 if p_expected_revision = 0 then
  insert into public.orbit_workspaces(user_id, workspace) values(owner_id,p_workspace)
   on conflict (user_id) do nothing returning revision into next_revision;
 else
  update public.orbit_workspaces set workspace=p_workspace, revision=revision+1, updated_at=now()
   where user_id=owner_id and revision=p_expected_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'Workspace changed on another device' using errcode = '40001'; end if;
 return next_revision;
end;
$$;
revoke all on function public.orbit_save_workspace(jsonb,bigint) from public, anon;
grant execute on function public.orbit_save_workspace(jsonb,bigint) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values ('orbit-files','orbit-files',false,20971520) on conflict(id) do nothing;
drop policy if exists "Read own orbit files" on storage.objects;
create policy "Read own orbit files" on storage.objects for select to authenticated using (bucket_id='orbit-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Upload own orbit files" on storage.objects;
create policy "Upload own orbit files" on storage.objects for insert to authenticated with check (bucket_id='orbit-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
