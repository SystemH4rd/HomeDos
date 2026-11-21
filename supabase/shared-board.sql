-- New content only: no private workspace or private attachment policy changes.
begin;
create table public.orbit_shared_nodes (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 author_name text not null default 'Учасник' check(char_length(author_name)<=80),
 node jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 constraint shared_node_size check(octet_length(node::text)<=131072),
 constraint shared_node_shape check(coalesce(jsonb_typeof(node)='object' and node->>'id'=id::text and node->>'type' in ('note','tasks','link','file') and jsonb_typeof(node->'title')='string',false))
);
alter table public.orbit_shared_nodes enable row level security;
revoke all on public.orbit_shared_nodes from anon,authenticated;
grant select,insert,delete on public.orbit_shared_nodes to authenticated;
grant update(node,revision,updated_at) on public.orbit_shared_nodes to authenticated;
revoke all on public.orbit_shared_nodes from anon;
create policy "Members read shared records" on public.orbit_shared_nodes for select to authenticated using(true);
create policy "Authors add shared records" on public.orbit_shared_nodes for insert to authenticated with check(owner_id=(select auth.uid()) and revision=1);
create policy "Authors update shared records" on public.orbit_shared_nodes for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "Authors delete shared records" on public.orbit_shared_nodes for delete to authenticated using(owner_id=(select auth.uid()));
create index orbit_shared_nodes_updated on public.orbit_shared_nodes(updated_at,id);
insert into storage.buckets(id,name,public,file_size_limit) values('orbit-shared-files','orbit-shared-files',false,20971520);
create policy "Authors upload shared files" on storage.objects for insert to authenticated with check(bucket_id='orbit-shared-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Members read published shared files" on storage.objects for select to authenticated using(bucket_id='orbit-shared-files' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.orbit_shared_nodes n where n.owner_id::text=(storage.foldername(name))[1] and n.node->>'fileId'=(storage.filename(name)))));
commit;
