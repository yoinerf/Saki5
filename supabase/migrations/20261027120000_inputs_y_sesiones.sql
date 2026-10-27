-- Sesiones y validación de datos de entrada (rama vulnerabilidades, 2026-10-27).
--
-- 1. Sesiones cerradas o revocadas dejan de servir de inmediato en la API.
--    Supabase emite access tokens (JWT) que duran 1 hora. Al cerrar sesión, cambiar la contraseña,
--    bloquear o eliminar la cuenta, Auth borra la sesión (auth.sessions), pero PostgREST solo
--    revisa la firma del JWT: el token copiado seguía leyendo y escribiendo datos hasta vencer.
--    private.check_request_session corre antes de cada petición a la API (db_pre_request) y la
--    rechaza con 401 si la sesión del token ya no existe, venció o la cuenta está bloqueada o borrada.
-- 2. profiles.email ya no se puede cambiar desde el navegador: siempre es el correo de Auth.
--    Antes un usuario podía poner el correo de otra persona (o de soporte) en su perfil, que es el
--    que ven los administradores.
-- 3. Un vendedor no puede crear productos o experiencias a nombre de otro, ni pasárselos.
-- 4. activities: cada usuario solo registra actividad propia y con un rol que tiene.
-- 5. Datos de entrega del pedido: solo los campos que usa la app, limpios y con largo máximo.
-- 6. Perfiles, productos y experiencias: se quitan caracteres invisibles y de control (sirven para
--    disfrazar nombres) y se validan largo y formato.
-- 7. Límites de tamaño y formato en columnas que aún no tenían (imágenes, anuncios, actividad...).
--
-- Las tablas base se crearon desde el dashboard: cada regla revisa que la tabla y las columnas
-- existan antes de crearse, y las restricciones nuevas se agregan NOT VALID (no fallan por datos
-- antiguos) y luego se intentan validar. Se puede ejecutar varias veces.

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ─── Utilidad: limpiar texto ─────────────────────────────────────────────────
-- Quita marcas de dirección (U+202A–202E, U+2066–2069), espacios de ancho cero y BOM, y
-- caracteres de control. Una línea: colapsa todos los espacios. Varias líneas: conserva \n.
create or replace function private.clean_text(p_value text, p_multiline boolean default false)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when p_multiline then
      btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        p_value,
        '[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]', '', 'g'),
        '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'),
        '\r\n?', E'\n', 'g'),
        '[ \t]+', ' ', 'g'), E' \n')
    else
      btrim(regexp_replace(regexp_replace(regexp_replace(
        p_value,
        '[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]', '', 'g'),
        '[\x01-\x1F\x7F]', ' ', 'g'),
        '\s+', ' ', 'g'))
  end
$$;

-- ─── 1. Sesión vigente en cada petición a la API ─────────────────────────────
create or replace function private.check_request_session()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_session uuid;
  v_user uuid;
  v_active boolean;
begin
  -- anon y service_role no tienen sesión de usuario
  if v_claims is null or v_claims->>'role' is distinct from 'authenticated' then
    return;
  end if;
  v_session := nullif(v_claims->>'session_id', '')::uuid;
  v_user := nullif(v_claims->>'sub', '')::uuid;
  -- Auth siempre incluye session_id; un token sin él solo lo puede firmar quien tiene el secreto JWT
  if v_session is null then
    return;
  end if;

  begin
    select exists (
      select 1
      from auth.sessions s
      join auth.users u on u.id = s.user_id
      where s.id = v_session
        and s.user_id = v_user
        and (s.not_after is null or s.not_after > now())
        and (u.banned_until is null or u.banned_until <= now())
        and u.deleted_at is null
    ) into v_active;
  exception when undefined_table or undefined_column or insufficient_privilege then
    -- Si Supabase cambia el esquema de Auth, la API sigue funcionando (sin esta revisión)
    raise warning 'check_request_session: no se pudo revisar la sesión: %', sqlerrm;
    return;
  end;

  if not v_active then
    -- errcode PGRST: PostgREST responde con este estado y este cuerpo
    raise exception using
      errcode = 'PGRST',
      message = json_build_object('code', 'session_revoked', 'message', 'Tu sesión se cerró. Inicia sesión de nuevo.')::text,
      detail = json_build_object('status', 401, 'headers', json_build_object('WWW-Authenticate', 'Bearer error="invalid_token"'))::text;
  end if;
end;
$$;

revoke all on function private.check_request_session() from public;
grant execute on function private.check_request_session() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'private.check_request_session';
notify pgrst, 'reload config';

-- ─── 2. profiles.email = correo de Auth ──────────────────────────────────────
create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  -- Sin usuario (service role, triggers de Auth, SQL Editor) se respeta lo que llega
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;
  select email into v_email from auth.users where id = new.id;
  new.email := coalesce(v_email, case when tg_op = 'UPDATE' then old.email else '' end);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists trg_profiles_sync_email on public.profiles;
    create trigger trg_profiles_sync_email
      before insert or update of email on public.profiles
      for each row execute function private.sync_profile_email();
  end if;
end $$;

-- Cuando el usuario cambia su correo en Auth, el perfil lo sigue
create or replace function private.auth_email_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
exception when others then
  -- Nunca impedir el cambio en Auth por un error en el perfil
  raise warning 'auth_email_changed: no se pudo actualizar el perfil de %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.auth_email_changed();

-- ─── 3. Dueño de productos y experiencias ────────────────────────────────────
create or replace function private.guard_catalog_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner text := coalesce(to_jsonb(new)->>'producer_id', to_jsonb(new)->>'host_id');
  v_old_owner text;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if v_owner is distinct from auth.uid()::text then
      raise exception 'Solo puedes publicar a tu nombre.' using errcode = '42501';
    end if;
  else
    v_old_owner := coalesce(to_jsonb(old)->>'producer_id', to_jsonb(old)->>'host_id');
    if v_owner is distinct from v_old_owner then
      raise exception 'No puedes cambiar el dueño de una publicación.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ─── 4. Actividad propia ─────────────────────────────────────────────────────
create or replace function private.guard_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary text;
begin
  new.title := private.clean_text(new.title);
  new.description := private.clean_text(new.description, true);
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.user_id := auth.uid();
  -- El rol con el que se registra debe ser uno de los de la cuenta
  if to_regclass('public.profile_roles') is null
     or not exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = new.user_role) then
    select user_type into v_primary from public.profiles where id = auth.uid();
    new.user_role := coalesce(v_primary, 'comprador');
  end if;
  return new;
end;
$$;

-- ─── 5. Datos de entrega del pedido ──────────────────────────────────────────
-- create_store_order guarda p_shipping tal cual llega del navegador. Aquí se dejan solo los
-- campos que la app muestra, como texto limpio y con largo máximo.
create or replace function private.clean_order_shipping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in jsonb := coalesce(new.shipping_address, '{}'::jsonb);
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_max int;
  v_val text;
begin
  if jsonb_typeof(v_in) <> 'object' then
    v_in := '{}'::jsonb;
  end if;
  foreach v_key in array array['fullName', 'phone', 'department', 'municipality', 'address', 'deliveryNotes'] loop
    if jsonb_typeof(v_in->v_key) in ('string', 'number') then
      v_max := case v_key when 'phone' then 15 when 'deliveryNotes' then 500 when 'fullName' then 200 when 'address' then 300 else 100 end;
      v_val := case
        when v_key = 'phone' then regexp_replace(v_in->>v_key, '\D', '', 'g')
        else private.clean_text(v_in->>v_key, v_key = 'deliveryNotes')
      end;
      v_out := v_out || jsonb_build_object(v_key, left(v_val, v_max));
    end if;
  end loop;
  new.shipping_address := v_out;
  new.customer_name := nullif(v_out->>'fullName', '');
  new.customer_phone := nullif(v_out->>'phone', '');
  return new;
end;
$$;

-- ─── 6. Perfiles, productos y experiencias ───────────────────────────────────
-- Solo se revisan las columnas que cambian: editar un perfil antiguo no falla por un dato viejo.
create or replace function private.validate_profile_input()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_insert boolean := tg_op = 'INSERT';
begin
  if v_is_insert or new.first_name is distinct from old.first_name then
    new.first_name := private.clean_text(new.first_name);
    if length(new.first_name) > 100 then raise exception 'El nombre admite máximo 100 caracteres.' using errcode = '23514'; end if;
  end if;
  if v_is_insert or new.last_name is distinct from old.last_name then
    new.last_name := private.clean_text(new.last_name);
    if length(new.last_name) > 100 then raise exception 'El apellido admite máximo 100 caracteres.' using errcode = '23514'; end if;
  end if;
  if v_is_insert or new.org_name is distinct from old.org_name then
    new.org_name := nullif(private.clean_text(new.org_name), '');
    if length(new.org_name) > 200 then raise exception 'El nombre de la organización admite máximo 200 caracteres.' using errcode = '23514'; end if;
  end if;
  if v_is_insert or new.phone is distinct from old.phone then
    new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), '');
    if new.phone !~ '^[0-9]{7,15}$' then raise exception 'El teléfono debe tener entre 7 y 15 dígitos.' using errcode = '23514'; end if;
  end if;
  if v_is_insert or new.address is distinct from old.address then
    new.address := nullif(private.clean_text(new.address), '');
    if length(new.address) > 300 then raise exception 'La dirección admite máximo 300 caracteres.' using errcode = '23514'; end if;
  end if;
  if v_is_insert or new.department is distinct from old.department or new.municipality is distinct from old.municipality then
    new.department := nullif(private.clean_text(new.department), '');
    new.municipality := nullif(private.clean_text(new.municipality), '');
    if length(new.department) > 100 or length(new.municipality) > 100 then
      raise exception 'El departamento y el municipio admiten máximo 100 caracteres.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.clean_catalog_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title then
    new.title := private.clean_text(new.title);
    if coalesce(new.title, '') = '' then raise exception 'El nombre es obligatorio.' using errcode = '23514'; end if;
  end if;
  if tg_op = 'INSERT' or new.description is distinct from old.description then
    new.description := nullif(private.clean_text(new.description, true), '');
  end if;
  return new;
end;
$$;

-- Triggers: solo si la tabla (y sus columnas) existen
do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists trg_profiles_validate_input on public.profiles;
    create trigger trg_profiles_validate_input
      before insert or update on public.profiles
      for each row execute function private.validate_profile_input();
  end if;

  if to_regclass('public.products') is not null then
    drop trigger if exists trg_products_guard_owner on public.products;
    create trigger trg_products_guard_owner
      before insert or update of producer_id on public.products
      for each row execute function private.guard_catalog_owner();
    drop trigger if exists trg_products_clean_text on public.products;
    create trigger trg_products_clean_text
      before insert or update of title, description on public.products
      for each row execute function private.clean_catalog_text();
  end if;

  if to_regclass('public.experiences') is not null then
    drop trigger if exists trg_experiences_guard_owner on public.experiences;
    create trigger trg_experiences_guard_owner
      before insert or update of host_id on public.experiences
      for each row execute function private.guard_catalog_owner();
    drop trigger if exists trg_experiences_clean_text on public.experiences;
    create trigger trg_experiences_clean_text
      before insert or update of title, description on public.experiences
      for each row execute function private.clean_catalog_text();
  end if;

  if to_regclass('public.activities') is not null then
    drop trigger if exists trg_activities_guard on public.activities;
    create trigger trg_activities_guard
      before insert or update on public.activities
      for each row execute function private.guard_activity();
  end if;

  if to_regclass('public.orders') is not null then
    drop trigger if exists trg_orders_clean_shipping on public.orders;
    create trigger trg_orders_clean_shipping
      before insert or update of shipping_address on public.orders
      for each row execute function private.clean_order_shipping();
  end if;
end $$;

-- Las funciones de trigger no se llaman directamente
revoke all on function private.clean_text(text, boolean) from public;
revoke all on function private.sync_profile_email() from public;
revoke all on function private.auth_email_changed() from public;
revoke all on function private.guard_catalog_owner() from public;
revoke all on function private.guard_activity() from public;
revoke all on function private.clean_order_shipping() from public;
revoke all on function private.validate_profile_input() from public;
revoke all on function private.clean_catalog_text() from public;

-- ─── 7. Límites de tamaño y formato ──────────────────────────────────────────
create or replace function pg_temp.ensure_check(p_table text, p_cols text[], p_name text, p_expr text)
returns void
language plpgsql
as $$
declare
  v_rel regclass := to_regclass('public.' || p_table);
  v_col text;
begin
  if v_rel is null then
    raise notice 'ensure_check: no existe la tabla %, se omite %', p_table, p_name;
    return;
  end if;
  foreach v_col in array p_cols loop
    if not exists (select 1 from pg_attribute where attrelid = v_rel and attname = v_col and not attisdropped) then
      raise notice 'ensure_check: no existe la columna %.%, se omite %', p_table, v_col, p_name;
      return;
    end if;
  end loop;

  execute format('alter table %s drop constraint if exists %I', v_rel, p_name);
  execute format('alter table %s add constraint %I check (%s) not valid', v_rel, p_name, p_expr);
  begin
    execute format('alter table %s validate constraint %I', v_rel, p_name);
  exception when check_violation then
    -- Hay datos antiguos fuera de la regla: se aplica a datos nuevos y se avisa
    raise notice 'ensure_check: % tiene filas antiguas que no cumplen %; queda para datos nuevos', p_table, p_name;
  end;
end;
$$;

select pg_temp.ensure_check('products', array['stock', 'unit'], 'products_stock_unit_length',
  'length(coalesce(stock, '''')) <= 40 and length(coalesce(unit, '''')) <= 40');
select pg_temp.ensure_check('experiences', array['capacity', 'duration', 'tags'], 'experiences_fields_length',
  'length(coalesce(capacity, '''')) <= 40 and length(coalesce(duration, '''')) <= 60
   and coalesce(cardinality(tags), 0) <= 20 and length(coalesce(array_to_string(tags, ''''), '''')) <= 800');
-- Solo URLs https (Supabase Storage o Unsplash, que es lo que permite la CSP del sitio)
select pg_temp.ensure_check('images', array['image_url', 'storage_path'], 'images_url_format',
  'image_url ~ ''^https://'' and length(image_url) <= 1000
   and length(coalesce(storage_path, '''')) <= 500 and coalesce(storage_path, '''') !~ ''(^/|\.\.)''');
select pg_temp.ensure_check('advertisements', array['image_url', 'link_url', 'title', 'starts_at', 'ends_at'], 'advertisements_fields_format',
  '(image_url is null or (image_url ~ ''^https://'' and length(image_url) <= 1000))
   and (link_url is null or (link_url ~ ''^https://'' and length(link_url) <= 1000))
   and length(coalesce(title, '''')) <= 200 and ends_at >= starts_at');
select pg_temp.ensure_check('activities', array['title', 'description', 'type', 'metadata'], 'activities_fields_length',
  'length(title) <= 200 and length(coalesce(description, '''')) <= 2000 and length(type) <= 50
   and pg_column_size(coalesce(metadata, ''{}''::jsonb)) <= 8192');
select pg_temp.ensure_check('store_settings', array['description', 'tagline', 'transfer_info'], 'store_settings_text_length',
  'length(coalesce(description, '''')) <= 1000 and length(coalesce(tagline, '''')) <= 300
   and pg_column_size(transfer_info) <= 4096');
select pg_temp.ensure_check('producer_documents', array['file_name', 'rejection_reason'], 'producer_documents_text_length',
  'length(file_name) <= 255 and length(coalesce(rejection_reason, '''')) <= 1000');
select pg_temp.ensure_check('profiles', array['first_name', 'last_name', 'org_name', 'address', 'department', 'municipality'], 'profiles_text_length',
  'length(coalesce(first_name, '''')) <= 100 and length(coalesce(last_name, '''')) <= 100
   and length(coalesce(org_name, '''')) <= 200 and length(coalesce(address, '''')) <= 300
   and length(coalesce(department, '''')) <= 100 and length(coalesce(municipality, '''')) <= 100');

commit;
