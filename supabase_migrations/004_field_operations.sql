-- Field operations, data quality, audit history, and recoverable bulk actions.
-- Safe to run after 003_auth_permissions.sql. Existing location rows remain valid.

alter table public.locations
    add column if not exists workflow_status text not null default 'new',
    add column if not exists assigned_to uuid references public.profiles (id) on delete set null,
    add column if not exists due_at timestamptz,
    add column if not exists verified_at timestamptz,
    add column if not exists verified_by uuid references public.profiles (id) on delete set null;

alter table public.locations
    drop constraint if exists locations_workflow_status_check;
alter table public.locations
    add constraint locations_workflow_status_check
    check (workflow_status in ('new', 'assigned', 'in_progress', 'verified', 'not_found', 'completed'));

create index if not exists idx_locations_workflow_status
    on public.locations (workflow_status) where deleted_at is null;
create index if not exists idx_locations_assigned_to
    on public.locations (assigned_to) where deleted_at is null;

create table if not exists public.location_revisions (
    id bigint generated always as identity primary key,
    location_id uuid not null,
    action text not null check (action in ('insert', 'update', 'delete', 'restore', 'rollback', 'merge')),
    before_data jsonb,
    after_data jsonb,
    changed_by uuid references auth.users (id) on delete set null,
    changed_at timestamptz not null default now()
);

create index if not exists idx_location_revisions_location_time
    on public.location_revisions (location_id, changed_at desc);

alter table public.location_revisions enable row level security;
drop policy if exists location_revisions_read on public.location_revisions;
create policy location_revisions_read
on public.location_revisions for select
to authenticated
using (true);

revoke insert, update, delete, truncate on public.location_revisions from anon, authenticated;
grant select on public.location_revisions to authenticated;

create or replace function private.capture_location_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    revision_action text;
begin
    revision_action := case
        when tg_op = 'INSERT' then 'insert'
        when tg_op = 'DELETE' then 'delete'
        when old.deleted_at is null and new.deleted_at is not null then 'delete'
        when old.deleted_at is not null and new.deleted_at is null then 'restore'
        else coalesce(nullif(current_setting('bt.revision_action', true), ''), 'update')
    end;

    insert into public.location_revisions (
        location_id, action, before_data, after_data, changed_by
    )
    values (
        coalesce(new.id, old.id),
        revision_action,
        case when tg_op = 'INSERT' then null else to_jsonb(old) end,
        case when tg_op = 'DELETE' then null else to_jsonb(new) end,
        auth.uid()
    );
    return coalesce(new, old);
end;
$$;

drop trigger if exists capture_location_revision on public.locations;
create trigger capture_location_revision
    after insert or update or delete on public.locations
    for each row execute procedure private.capture_location_revision();

create or replace function public.update_location_workflow(
    target_id uuid,
    next_status text,
    next_assignee uuid default null,
    next_due_at timestamptz default null
)
returns public.locations
language plpgsql
security definer
set search_path = ''
as $$
declare
    result public.locations;
begin
    if not private.has_permission('edit') then
        raise exception 'Edit permission is required' using errcode = '42501';
    end if;
    if next_status not in ('new', 'assigned', 'in_progress', 'verified', 'not_found', 'completed') then
        raise exception 'Invalid workflow status' using errcode = '22023';
    end if;
    if next_assignee is not null and not exists (
        select 1 from public.profiles where id = next_assignee
    ) then
        raise exception 'Unknown assignee' using errcode = '22023';
    end if;

    update public.locations
    set workflow_status = next_status,
        assigned_to = next_assignee,
        due_at = next_due_at,
        verified_at = case when next_status = 'verified' then now() else verified_at end,
        verified_by = case when next_status = 'verified' then auth.uid() else verified_by end,
        updated_at = now()
    where id = target_id and deleted_at is null
    returning * into result;

    if result.id is null then
        raise exception 'Location not found' using errcode = 'P0002';
    end if;
    return result;
end;
$$;

create or replace function public.bulk_update_locations(
    location_ids uuid[],
    patch jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    changed_count integer;
    next_status text;
begin
    if not private.has_permission('edit') then
        raise exception 'Edit permission is required' using errcode = '42501';
    end if;
    if coalesce(array_length(location_ids, 1), 0) = 0 or array_length(location_ids, 1) > 500 then
        raise exception 'Select between 1 and 500 locations' using errcode = '22023';
    end if;
    if patch - array['list', 'city', 'tags', 'workflow_status', 'assigned_to', 'due_at'] <> '{}'::jsonb then
        raise exception 'Patch contains unsupported fields' using errcode = '22023';
    end if;

    next_status := patch ->> 'workflow_status';
    if next_status is not null and next_status not in
        ('new', 'assigned', 'in_progress', 'verified', 'not_found', 'completed') then
        raise exception 'Invalid workflow status' using errcode = '22023';
    end if;

    update public.locations
    set
        list = case when patch ? 'list' then patch ->> 'list' else list end,
        city = case when patch ? 'city' then patch ->> 'city' else city end,
        tags = case when patch ? 'tags' then patch ->> 'tags' else tags end,
        workflow_status = case when patch ? 'workflow_status' then next_status else workflow_status end,
        assigned_to = case
            when patch ? 'assigned_to' and nullif(patch ->> 'assigned_to', '') is not null
                then (patch ->> 'assigned_to')::uuid
            when patch ? 'assigned_to' then null
            else assigned_to
        end,
        due_at = case
            when patch ? 'due_at' and nullif(patch ->> 'due_at', '') is not null
                then (patch ->> 'due_at')::timestamptz
            when patch ? 'due_at' then null
            else due_at
        end,
        verified_at = case when next_status = 'verified' then now() else verified_at end,
        verified_by = case when next_status = 'verified' then auth.uid() else verified_by end,
        updated_at = now()
    where id = any(location_ids) and deleted_at is null;

    get diagnostics changed_count = row_count;
    return changed_count;
end;
$$;

create or replace function public.merge_locations(
    keep_id uuid,
    remove_ids uuid[]
)
returns public.locations
language plpgsql
security definer
set search_path = ''
as $$
declare
    keeper public.locations;
    duplicate public.locations;
begin
    if not private.has_permission('edit') or not private.has_permission('delete') then
        raise exception 'Edit and delete permissions are required' using errcode = '42501';
    end if;
    if keep_id = any(remove_ids) then
        raise exception 'Keeper cannot be removed' using errcode = '22023';
    end if;
    if coalesce(array_length(remove_ids, 1), 0) = 0 or array_length(remove_ids, 1) > 50 then
        raise exception 'Select between 1 and 50 duplicates' using errcode = '22023';
    end if;

    select * into keeper from public.locations
    where id = keep_id and deleted_at is null for update;
    if keeper.id is null then
        raise exception 'Keeper not found' using errcode = 'P0002';
    end if;

    for duplicate in
        select * from public.locations
        where id = any(remove_ids) and deleted_at is null for update
    loop
        keeper.name := case when keeper.name = '' then duplicate.name else keeper.name end;
        keeper.list := case when keeper.list = '' then duplicate.list else keeper.list end;
        keeper.city := case when keeper.city = '' then duplicate.city else keeper.city end;
        keeper.note := concat_ws(E'\n', nullif(keeper.note, ''), nullif(duplicate.note, ''));
        keeper.tags := array_to_string(
            array(
                select distinct trim(value)
                from unnest(string_to_array(concat_ws(',', keeper.tags, duplicate.tags), ',')) value
                where trim(value) <> ''
            ),
            ','
        );
    end loop;

    perform set_config('bt.revision_action', 'merge', true);
    update public.locations
    set name = keeper.name,
        list = keeper.list,
        city = keeper.city,
        note = keeper.note,
        tags = keeper.tags,
        updated_at = now()
    where id = keep_id
    returning * into keeper;

    update public.locations
    set deleted_at = now(), deleted_by = private.actor_label(), updated_at = now()
    where id = any(remove_ids) and deleted_at is null;
    return keeper;
end;
$$;

create or replace function public.rollback_location(revision_id bigint)
returns public.locations
language plpgsql
security definer
set search_path = ''
as $$
declare
    revision public.location_revisions;
    restored public.locations;
begin
    if not private.has_permission('restore') then
        raise exception 'Restore permission is required' using errcode = '42501';
    end if;
    select * into revision from public.location_revisions where id = revision_id;
    if revision.id is null or revision.before_data is null then
        raise exception 'Revision cannot be restored' using errcode = '22023';
    end if;

    perform set_config('bt.revision_action', 'rollback', true);
    update public.locations
    set
        name = coalesce(revision.before_data ->> 'name', ''),
        lat = (revision.before_data ->> 'lat')::double precision,
        lng = (revision.before_data ->> 'lng')::double precision,
        list = coalesce(revision.before_data ->> 'list', ''),
        city = coalesce(revision.before_data ->> 'city', ''),
        note = coalesce(revision.before_data ->> 'note', ''),
        tags = coalesce(revision.before_data ->> 'tags', ''),
        photo = coalesce(revision.before_data ->> 'photo', ''),
        workflow_status = coalesce(revision.before_data ->> 'workflow_status', 'new'),
        assigned_to = nullif(revision.before_data ->> 'assigned_to', '')::uuid,
        due_at = nullif(revision.before_data ->> 'due_at', '')::timestamptz,
        verified_at = nullif(revision.before_data ->> 'verified_at', '')::timestamptz,
        verified_by = nullif(revision.before_data ->> 'verified_by', '')::uuid,
        deleted_at = nullif(revision.before_data ->> 'deleted_at', '')::timestamptz,
        deleted_by = nullif(revision.before_data ->> 'deleted_by', ''),
        updated_at = now()
    where id = revision.location_id
    returning * into restored;

    if restored.id is null then
        raise exception 'Location no longer exists' using errcode = 'P0002';
    end if;
    return restored;
end;
$$;

revoke all on function public.update_location_workflow(uuid, text, uuid, timestamptz) from public, anon;
revoke all on function public.bulk_update_locations(uuid[], jsonb) from public, anon;
revoke all on function public.merge_locations(uuid, uuid[]) from public, anon;
revoke all on function public.rollback_location(bigint) from public, anon;
grant execute on function public.update_location_workflow(uuid, text, uuid, timestamptz) to authenticated;
grant execute on function public.bulk_update_locations(uuid[], jsonb) to authenticated;
grant execute on function public.merge_locations(uuid, uuid[]) to authenticated;
grant execute on function public.rollback_location(bigint) to authenticated;
