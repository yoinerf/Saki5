-- Pendientes de la auditoría 2026-10-26 (docs/seguridad/auditoria-2026-10-26.html):
--   R1. Un productor verificado no puede cambiar por su cuenta su documento ni el nombre con el que
--       publica (organización, o nombre y apellido si no tiene organización). Lo hace el superadmin.
--   R2. Solo se reseña un producto que se recibió (ítem en estado Entregado de un pedido propio).
--   R3. Los pedidos pagados por adelantado que no se pagan a tiempo se cancelan solos (y devuelven el
--       inventario). Plazo por defecto: 48 horas, editable por tienda en Superadmin → Tiendas.
--   R8. "Debes cambiar tu contraseña" deja de depender de user_metadata (que el usuario puede editar):
--       vive en una tabla sin acceso desde el navegador y solo se apaga cuando la contraseña cambia.
--   R9. product_rating_stats: promedio y cantidad de reseñas por producto, calculados en la base
--       (las vitrinas ya no descargan todas las reseñas).

begin;

-- ─── R1. Identidad del productor verificado ───────────────────────────────────
create or replace function public.protect_verified_producer_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if old.user_type not in ('asociacion', 'turismo') or not public.is_producer_validated(old.id) then
    return new;
  end if;

  if (new.document_type, new.document_number) is distinct from (old.document_type, old.document_number)
     or coalesce(nullif(trim(new.org_name), ''), '') <> coalesce(nullif(trim(old.org_name), ''), '')
     -- Sin organización, el nombre y apellido es el nombre con el que publica
     or (coalesce(nullif(trim(old.org_name), ''), '') = ''
         and (coalesce(trim(new.first_name), ''), coalesce(trim(new.last_name), ''))
             is distinct from (coalesce(trim(old.first_name), ''), coalesce(trim(old.last_name), ''))) then
    raise exception 'Tu perfil está verificado: para cambiar tu documento o el nombre con el que publicas, escríbenos a soporte.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_verified_identity on public.profiles;
create trigger trg_profiles_protect_verified_identity
  before update on public.profiles
  for each row execute function public.protect_verified_producer_identity();

revoke execute on function public.protect_verified_producer_identity() from public, anon, authenticated;

-- ─── R2. Reseñas con compra entregada ─────────────────────────────────────────
-- Las reseñas que ya existían se conservan; editarlas sigue permitido.
create or replace function public.guard_product_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'Solo puedes escribir reseñas a tu nombre';
  end if;

  if exists (select 1 from public.products where id = new.product_id and producer_id = new.user_id) then
    raise exception 'No puedes calificar tus propios productos';
  end if;

  if (tg_op = 'INSERT' or new.product_id is distinct from old.product_id) and not exists (
    select 1
    from public.order_items i
    join public.orders o on o.id = i.order_id
    join public.order_statuses s on s.id = i.status_id
    where i.product_id = new.product_id
      and o.customer_id = new.user_id
      and s.code = 'Delivered'
  ) then
    raise exception 'Solo puedes calificar productos que ya recibiste';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_product_review() from public, anon, authenticated;

-- ─── R3. Cancelar pedidos sin pagar vencidos ──────────────────────────────────
-- Explícita sobre qué cancela: ítems en "Pendiente de pago" de pedidos que NO son contraentrega
-- (la contraentrega se paga al recibir), sin pago confirmado y más viejos que el plazo de su tienda.
-- Al pasar a Cancelado, los triggers de order_items devuelven el inventario y avisan al comprador,
-- igual que si lo cancelara el vendedor. Un ítem que no se pueda cancelar no detiene a los demás.
create or replace function public.cancel_expired_unpaid_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled_id bigint;
  v_item uuid;
  v_count integer := 0;
begin
  select id into v_cancelled_id from public.order_statuses where code = 'Cancelled';
  if v_cancelled_id is null then
    raise exception 'No existe el estado Cancelled en order_statuses';
  end if;

  for v_item in
    select i.id
    from public.order_items i
    join public.orders o on o.id = i.order_id
    join public.store_settings st on st.store = coalesce(o.store, 'campo')
    join public.order_statuses s on s.id = i.status_id
    where s.code = 'PendingPayment'
      and o.payment_method is distinct from 'CashOnDelivery'
      and o.payment_status is distinct from 'Paid'
      and i.payment_status is distinct from 'Paid'
      and coalesce(st.payment_timeout_hours, 0) > 0
      and o.created_at < now() - make_interval(hours => st.payment_timeout_hours::int)
    for update of i skip locked
  loop
    begin
      update public.order_items set status_id = v_cancelled_id where id = v_item;
      v_count := v_count + 1;
    exception when others then
      raise warning 'cancel_expired_unpaid_orders: no se pudo cancelar el ítem %: %', v_item, sqlerrm;
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.cancel_expired_unpaid_orders() from public, anon, authenticated;

update public.store_settings set payment_timeout_hours = 48 where payment_timeout_hours is null;

select cron.schedule(
  'cancelar-pedidos-sin-pago',
  '0 * * * *',
  $cron$select public.cancel_expired_unpaid_orders()$cron$
);

-- ─── R8. Cambio de contraseña obligatorio ─────────────────────────────────────
-- Guarda el hash de la contraseña temporal: mientras el usuario no la cambie, el hash coincide.
create table if not exists public.password_change_required (
  user_id uuid primary key references auth.users(id) on delete cascade,
  temp_password_hash text,
  created_at timestamptz not null default now()
);

comment on table public.password_change_required is
  'Cuentas con contraseña temporal. La marca admin-users (mark_password_change_required) y desaparece al cambiar la contraseña.';

alter table public.password_change_required enable row level security;
revoke all on public.password_change_required from public, anon, authenticated;

-- Solo admin-users (service_role), justo después de asignar la contraseña temporal
create or replace function public.mark_password_change_required(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.password_change_required (user_id, temp_password_hash)
  select id, encrypted_password from auth.users where id = p_user
  on conflict (user_id) do update
    set temp_password_hash = excluded.temp_password_hash, created_at = now();
end;
$$;

-- El usuario solo puede preguntar por su cuenta. Si la contraseña ya cambió, borra la marca.
create or replace function public.my_password_change_required()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_temp text;
  v_found boolean;
begin
  if v_user is null then
    return false;
  end if;
  select true, temp_password_hash into v_found, v_temp from public.password_change_required where user_id = v_user;
  if v_found is null then
    return false;
  end if;
  if (select encrypted_password from auth.users where id = v_user) is distinct from v_temp then
    delete from public.password_change_required where user_id = v_user;
    return false;
  end if;
  return true;
end;
$$;

revoke execute on function public.mark_password_change_required(uuid) from public, anon, authenticated;
grant execute on function public.mark_password_change_required(uuid) to service_role;
revoke execute on function public.my_password_change_required() from public, anon;
grant execute on function public.my_password_change_required() to authenticated;

-- Cuentas que hoy tienen la marca en sus metadatos
insert into public.password_change_required (user_id, temp_password_hash)
select id, encrypted_password from auth.users
where raw_user_meta_data->>'must_change_password' = 'true'
on conflict (user_id) do nothing;

-- ─── R9. Calificación por producto ────────────────────────────────────────────
create or replace view public.product_rating_stats
  with (security_invoker = true) as
  select product_id,
         round(avg(rating)::numeric, 1) as rating,
         count(*)::integer as reviews
  from public.product_reviews
  group by product_id;

comment on view public.product_rating_stats is
  'Promedio (1 decimal) y cantidad de reseñas por producto. Usa las políticas de product_reviews.';

revoke all on public.product_rating_stats from public, anon, authenticated;
grant select on public.product_rating_stats to anon, authenticated;

commit;
