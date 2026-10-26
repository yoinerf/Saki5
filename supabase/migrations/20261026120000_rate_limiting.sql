-- Límite de solicitudes (rate limiting).
--
-- Supabase no limita las solicitudes a las Edge Functions ni a las RPC: cualquiera puede llamarlas en
-- bucle. Aquí:
--   1. rate_limits: contador por clave y ventana fija de tiempo (p. ej. "admin-users:ip:1.2.3.4").
--      Sin acceso desde el navegador (RLS sin políticas y sin permisos).
--   2. check_rate_limit(key, max, window): suma una solicitud y responde si se permite. Solo la puede
--      ejecutar service_role (las Edge Functions; ver supabase/functions/_shared/rateLimit.ts).
--   3. enforce_rate_limit(key, max, window): igual, pero lanza un error. Para usar dentro de RPC.
--   4. Pedidos (create_store_order): máximo 10 por hora y 30 por día por usuario, con un trigger en orders. Cada pedido sin pagar
--      reserva inventario, así que un usuario no puede vaciar el stock de un productor creando pedidos
--      en bucle (ver docs/seguridad/auditoria-2026-10-19.md, recomendación 1). Los pedidos que fallan
--      no cuentan (la transacción se revierte junto con el contador).
--   5. Limpieza diaria de los contadores viejos (pg_cron).

begin;

-- ─── 1. Contadores ────────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

comment on table public.rate_limits is
  'Contadores de rate limiting por clave y ventana fija. Solo los escriben check_rate_limit / enforce_rate_limit.';

-- Para la limpieza por fecha
create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

-- ─── 2. Verificar y contar ────────────────────────────────────────────────────
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200
     or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Parámetros de rate limit inválidos';
  end if;

  -- Ventana fija: todas las solicitudes del mismo intervalo comparten fila
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  return jsonb_build_object(
    'allowed', v_hits <= p_max,
    'remaining', greatest(p_max - v_hits, 0),
    'retry_after', case
      when v_hits <= p_max then 0
      else greatest(ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now()))), 1)::int
    end
  );
end;
$$;

-- ─── 3. Versión que lanza error (para RPC) ────────────────────────────────────
create or replace function public.enforce_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := public.check_rate_limit(p_key, p_max, p_window_seconds);
  v_minutes integer;
begin
  if not (v_result->>'allowed')::boolean then
    v_minutes := greatest(ceil((v_result->>'retry_after')::numeric / 60), 1);
    raise exception 'Demasiadas solicitudes. Intenta de nuevo en % minuto(s).', v_minutes
      using hint = 'rate_limited';
  end if;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.enforce_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ─── 4. Pedidos ───────────────────────────────────────────────────────────────
-- Los pedidos solo se crean con create_store_order (no hay política de INSERT en orders), así que un
-- trigger en orders limita los pedidos sin depender del texto de la función. Si se supera el límite,
-- el error revierte todo el pedido (y el contador, que va en la misma transacción).
create or replace function public.rate_limit_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  -- Cada pedido sin pagar reserva inventario
  perform public.enforce_rate_limit('create_store_order:h:' || auth.uid(), 10, 3600);
  perform public.enforce_rate_limit('create_store_order:d:' || auth.uid(), 30, 86400);
  return new;
end;
$$;

drop trigger if exists trg_orders_rate_limit on public.orders;
create trigger trg_orders_rate_limit
  before insert on public.orders
  for each row execute function public.rate_limit_new_order();

revoke execute on function public.rate_limit_new_order() from public, anon, authenticated;

-- ─── 5. Limpieza ──────────────────────────────────────────────────────────────
select cron.schedule(
  'cleanup-rate-limits',
  '15 * * * *',
  $cron$delete from public.rate_limits where window_start < now() - interval '2 days'$cron$
);

commit;
