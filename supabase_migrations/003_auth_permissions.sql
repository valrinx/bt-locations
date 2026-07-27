-- Supabase Auth + per-user permissions for BT Locations.
--
-- IMPORTANT:
-- Seed the first owner separately in the Supabase SQL editor so an email
-- address is not committed to a public repository:
--
--   insert into private.admin_bootstrap_emails (email)
--   values (lower('<owner email>'))
--   on conflict (email) do nothing;
--
-- Run that statement in the same SQL editor execution as this migration.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_bootstrap_emails (
    email text primary key check (email = lower(email)),
    created_at timestamptz not null default now()
);
revoke all on private.admin_bootstrap_emails from public, anon, authenticated;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null,
    display_name text not null default '',
    is_admin boolean not null default false,
    can_edit boolean not null default false,
    can_delete boolean not null default false,
    can_import boolean not null default false,
    can_restore boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function private.promote_bootstrap_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.profiles
    set
        is_admin = true,
        can_edit = true,
        can_delete = true,
        can_import = true,
        can_restore = true,
        updated_at = now()
    where email = new.email;
    return new;
end;
$$;

drop trigger if exists on_admin_bootstrap_email_added
on private.admin_bootstrap_emails;
create trigger on_admin_bootstrap_email_added
    after insert or update of email on private.admin_bootstrap_emails
    for each row execute procedure private.promote_bootstrap_admin();

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (select p.is_admin from public.profiles as p where p.id = auth.uid()),
        false
    );
$$;

create or replace function private.has_permission(permission_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (
            select
                p.is_admin
                or case permission_name
                    when 'edit' then p.can_edit
                    when 'delete' then p.can_delete
                    when 'import' then p.can_import
                    when 'restore' then p.can_restore
                    else false
                end
            from public.profiles as p
            where p.id = auth.uid()
        ),
        false
    );
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.has_permission(text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_permission(text) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    bootstrap_admin boolean;
begin
    select exists (
        select 1
        from private.admin_bootstrap_emails as a
        where a.email = lower(new.email)
    )
    into bootstrap_admin;

    insert into public.profiles (
        id,
        email,
        display_name,
        is_admin,
        can_edit,
        can_delete,
        can_import,
        can_restore
    )
    values (
        new.id,
        lower(new.email),
        coalesce(new.raw_user_meta_data ->> 'display_name', ''),
        bootstrap_admin,
        bootstrap_admin,
        bootstrap_admin,
        bootstrap_admin,
        bootstrap_admin
    )
    on conflict (id) do update
    set
        email = excluded.email,
        display_name = case
            when public.profiles.display_name = '' then excluded.display_name
            else public.profiles.display_name
        end,
        is_admin = public.profiles.is_admin or excluded.is_admin,
        can_edit = public.profiles.can_edit or excluded.can_edit,
        can_delete = public.profiles.can_delete or excluded.can_delete,
        can_import = public.profiles.can_import or excluded.can_import,
        can_restore = public.profiles.can_restore or excluded.can_restore,
        updated_at = now();

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert or update of email, raw_user_meta_data on auth.users
    for each row execute procedure private.handle_new_user();

-- Backfill profiles for users who signed up before this migration.
insert into public.profiles (
    id,
    email,
    display_name,
    is_admin,
    can_edit,
    can_delete,
    can_import,
    can_restore
)
select
    u.id,
    lower(u.email),
    coalesce(u.raw_user_meta_data ->> 'display_name', ''),
    exists (
        select 1
        from private.admin_bootstrap_emails as a
        where a.email = lower(u.email)
    ),
    exists (
        select 1
        from private.admin_bootstrap_emails as a
        where a.email = lower(u.email)
    ),
    exists (
        select 1
        from private.admin_bootstrap_emails as a
        where a.email = lower(u.email)
    ),
    exists (
        select 1
        from private.admin_bootstrap_emails as a
        where a.email = lower(u.email)
    ),
    exists (
        select 1
        from private.admin_bootstrap_emails as a
        where a.email = lower(u.email)
    )
from auth.users as u
where u.email is not null
on conflict (id) do nothing;

do $$
declare
    policy_row record;
begin
    for policy_row in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'profiles'
    loop
        execute format('drop policy if exists %I on public.profiles', policy_row.policyname);
    end loop;
end
$$;

create policy profiles_read_self_or_admin
on public.profiles
for select
to authenticated
using (id = auth.uid() or private.is_admin());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create or replace function public.admin_set_permissions(
    target_user_id uuid,
    allow_edit boolean,
    allow_delete boolean,
    allow_import boolean,
    allow_restore boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
    updated_profile public.profiles;
begin
    if not private.is_admin() then
        raise exception 'Only an administrator can change permissions'
            using errcode = '42501';
    end if;

    update public.profiles
    set
        can_edit = case when is_admin then true else coalesce(allow_edit, false) end,
        can_delete = case when is_admin then true else coalesce(allow_delete, false) end,
        can_import = case when is_admin then true else coalesce(allow_import, false) end,
        can_restore = case when is_admin then true else coalesce(allow_restore, false) end,
        updated_at = now()
    where id = target_user_id
    returning * into updated_profile;

    if updated_profile.id is null then
        raise exception 'User profile not found' using errcode = 'P0002';
    end if;

    return updated_profile;
end;
$$;

revoke all on function public.admin_set_permissions(uuid, boolean, boolean, boolean, boolean)
from public, anon;
grant execute on function public.admin_set_permissions(uuid, boolean, boolean, boolean, boolean)
to authenticated;

create or replace function private.actor_label()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        nullif(p.display_name, ''),
        p.email,
        auth.uid()::text
    )
    from public.profiles as p
    where p.id = auth.uid();
$$;

revoke all on function private.actor_label() from public, anon, authenticated;
grant execute on function private.actor_label() to authenticated;

create or replace function private.safe_uuid(raw_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
    return raw_value::uuid;
exception
    when invalid_text_representation then
        return null;
end;
$$;

revoke all on function private.safe_uuid(text) from public, anon, authenticated;

create or replace function public.soft_delete_locations(location_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    affected integer;
begin
    if not private.has_permission('delete') then
        raise exception 'Delete permission is required' using errcode = '42501';
    end if;

    update public.locations
    set
        deleted_at = now(),
        deleted_by = private.actor_label(),
        updated_at = now()
    where id = any(location_ids)
      and deleted_at is null;

    get diagnostics affected = row_count;
    return affected;
end;
$$;

revoke all on function public.soft_delete_locations(uuid[]) from public, anon;
grant execute on function public.soft_delete_locations(uuid[]) to authenticated;

create or replace function public.import_locations(
    rows_json jsonb,
    replace_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    item jsonb;
    item_lat double precision;
    item_lng double precision;
    inserted_count integer := 0;
    deleted_count integer := 0;
begin
    if not private.has_permission('import') then
        raise exception 'Import permission is required' using errcode = '42501';
    end if;
    if jsonb_typeof(rows_json) <> 'array' then
        raise exception 'rows_json must be a JSON array' using errcode = '22023';
    end if;
    if replace_existing and not private.has_permission('delete') then
        raise exception 'Delete permission is required for replace import'
            using errcode = '42501';
    end if;

    if replace_existing then
        update public.locations
        set
            deleted_at = now(),
            deleted_by = private.actor_label(),
            updated_at = now()
        where deleted_at is null;
        get diagnostics deleted_count = row_count;
    end if;

    for item in select value from jsonb_array_elements(rows_json)
    loop
        item_lat := (item ->> 'lat')::double precision;
        item_lng := (item ->> 'lng')::double precision;
        if item_lat not between -90 and 90 or item_lng not between -180 and 180 then
            raise exception 'Invalid coordinates in import row' using errcode = '22023';
        end if;

        if replace_existing or not exists (
            select 1
            from public.locations as l
            where l.deleted_at is null
              and l.lat = item_lat
              and l.lng = item_lng
        ) then
            insert into public.locations (
                name, lat, lng, list, city, note, tags, photo, added_by, updated_at
            )
            values (
                coalesce(item ->> 'name', ''),
                item_lat,
                item_lng,
                coalesce(item ->> 'list', ''),
                coalesce(item ->> 'city', ''),
                coalesce(item ->> 'note', ''),
                coalesce(item ->> 'tags', ''),
                coalesce(item ->> 'photo', ''),
                private.actor_label(),
                now()
            );
            inserted_count := inserted_count + 1;
        end if;
    end loop;

    return jsonb_build_object(
        'inserted', inserted_count,
        'deleted', deleted_count
    );
end;
$$;

revoke all on function public.import_locations(jsonb, boolean) from public, anon;
grant execute on function public.import_locations(jsonb, boolean) to authenticated;

create or replace function public.restore_locations(rows_json jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    item jsonb;
    item_id uuid;
    existing_id uuid;
    item_lat double precision;
    item_lng double precision;
    restored_count integer := 0;
    inserted_count integer := 0;
begin
    if not private.has_permission('restore') then
        raise exception 'Restore permission is required' using errcode = '42501';
    end if;
    if jsonb_typeof(rows_json) <> 'array' then
        raise exception 'rows_json must be a JSON array' using errcode = '22023';
    end if;

    for item in select value from jsonb_array_elements(rows_json)
    loop
        item_id := private.safe_uuid(item ->> 'id');
        item_lat := (item ->> 'lat')::double precision;
        item_lng := (item ->> 'lng')::double precision;
        existing_id := null;

        if item_lat not between -90 and 90 or item_lng not between -180 and 180 then
            raise exception 'Invalid coordinates in restore row' using errcode = '22023';
        end if;

        if item_id is not null then
            select l.id into existing_id
            from public.locations as l
            where l.id = item_id;
        end if;

        if existing_id is null then
            select l.id into existing_id
            from public.locations as l
            where l.lat = item_lat and l.lng = item_lng
            order by (l.deleted_at is null) desc, l.updated_at desc
            limit 1;
        end if;

        if existing_id is not null then
            update public.locations
            set
                name = coalesce(item ->> 'name', ''),
                lat = item_lat,
                lng = item_lng,
                list = coalesce(item ->> 'list', ''),
                city = coalesce(item ->> 'city', ''),
                note = coalesce(item ->> 'note', ''),
                tags = coalesce(item ->> 'tags', ''),
                photo = coalesce(item ->> 'photo', ''),
                added_by = coalesce(nullif(item ->> 'added_by', ''), private.actor_label()),
                updated_at = now(),
                deleted_at = null,
                deleted_by = null
            where id = existing_id;
            restored_count := restored_count + 1;
        else
            if item_id is null then
                insert into public.locations (
                    name, lat, lng, list, city, note, tags, photo, added_by, updated_at
                )
                values (
                    coalesce(item ->> 'name', ''),
                    item_lat,
                    item_lng,
                    coalesce(item ->> 'list', ''),
                    coalesce(item ->> 'city', ''),
                    coalesce(item ->> 'note', ''),
                    coalesce(item ->> 'tags', ''),
                    coalesce(item ->> 'photo', ''),
                    coalesce(nullif(item ->> 'added_by', ''), private.actor_label()),
                    now()
                );
            else
                insert into public.locations (
                    id, name, lat, lng, list, city, note, tags, photo, added_by, updated_at
                )
                values (
                    item_id,
                    coalesce(item ->> 'name', ''),
                    item_lat,
                    item_lng,
                    coalesce(item ->> 'list', ''),
                    coalesce(item ->> 'city', ''),
                    coalesce(item ->> 'note', ''),
                    coalesce(item ->> 'tags', ''),
                    coalesce(item ->> 'photo', ''),
                    coalesce(nullif(item ->> 'added_by', ''), private.actor_label()),
                    now()
                );
            end if;
            inserted_count := inserted_count + 1;
        end if;
    end loop;

    return jsonb_build_object(
        'restored', restored_count,
        'inserted', inserted_count
    );
end;
$$;

revoke all on function public.restore_locations(jsonb) from public, anon;
grant execute on function public.restore_locations(jsonb) to authenticated;

create or replace function public.restore_remove_locations(location_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    affected integer;
begin
    if not private.has_permission('restore') then
        raise exception 'Restore permission is required' using errcode = '42501';
    end if;

    update public.locations
    set
        deleted_at = now(),
        deleted_by = private.actor_label(),
        updated_at = now()
    where id = any(location_ids)
      and deleted_at is null;

    get diagnostics affected = row_count;
    return affected;
end;
$$;

revoke all on function public.restore_remove_locations(uuid[]) from public, anon;
grant execute on function public.restore_remove_locations(uuid[]) to authenticated;

-- Replace any legacy permissive policies with an explicit public-read,
-- authenticated-write model.
alter table public.locations enable row level security;

do $$
declare
    policy_row record;
begin
    for policy_row in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'locations'
    loop
        execute format('drop policy if exists %I on public.locations', policy_row.policyname);
    end loop;
end
$$;

create policy locations_public_read
on public.locations
for select
to anon, authenticated
using (true);

create policy locations_edit_insert
on public.locations
for insert
to authenticated
with check (private.has_permission('edit'));

create policy locations_edit_update
on public.locations
for update
to authenticated
using (private.has_permission('edit'))
with check (private.has_permission('edit'));

revoke insert, update, delete on public.locations from anon, authenticated;
grant select on public.locations to anon, authenticated;
grant insert (
    name, lat, lng, list, city, note, tags, photo, added_by, updated_at
) on public.locations to authenticated;
grant update (
    name, lat, lng, list, city, note, tags, photo, added_by, updated_at
) on public.locations to authenticated;
