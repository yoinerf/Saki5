-- Revisión de seguridad y rendimiento de la base (solo lectura).
-- Ejecutar en Supabase → SQL Editor después de cada migración importante. Cada consulta debería
-- devolver 0 filas; lo que aparezca es un punto a revisar.
-- Complementa los Security / Performance Advisors del dashboard.

-- 1. Tablas de public sin RLS (cualquiera con la llave anon podría leerlas o escribirlas)
select c.relname as tabla_sin_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
order by 1;

-- 2. Tablas con RLS pero con permisos para anon/authenticated y sin ninguna política
--    (bloqueadas de hecho; confirmar que es intencional, p. ej. rate_limits)
select c.relname as tabla_sin_politicas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
order by 1;

-- 3. Políticas que permiten todo a cualquiera (using true / with check true) en escritura
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and (coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true')
order by 1, 2;

-- 4. Funciones SECURITY DEFINER sin search_path fijo
select p.oid::regprocedure as funcion_sin_search_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
order by 1;

-- 5. Funciones SECURITY DEFINER que anon puede ejecutar (revisar que validen a quien llama)
select p.oid::regprocedure as funcion_ejecutable_por_anon
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
order by 1;

-- 6. Vistas sin security_invoker (corren con los permisos del dueño, saltan RLS)
select c.relname as vista_security_definer
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false)
order by 1;
-- public_profiles es security definer a propósito: expone solo nombre y organización de vendedores.

-- 7. Llaves foráneas sin índice que empiece por sus columnas
select c.conrelid::regclass as tabla, c.conname as llave_sin_indice
from pg_constraint c
where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid
      and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
  )
order by 1, 2;

-- 8. Índices duplicados (mismas columnas, misma tabla)
select indrelid::regclass as tabla, array_agg(indexrelid::regclass) as indices_duplicados
from pg_index
where indrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
group by indrelid, indkey::text, coalesce(indexprs::text, ''), coalesce(indpred::text, '')
having count(*) > 1;

-- 9. Jobs de pg_cron activos (deben estar: cleanup-old-notifications, cleanup-rate-limits,
--    cancelar-pedidos-sin-pago)
select jobname, schedule, active from cron.job order by 1;

-- 10. Revisión de sesión en cada petición (20261027120000): debe salir
--     pgrst.db_pre_request=private.check_request_session
select unnest(rolconfig) as config_authenticator from pg_roles where rolname = 'authenticator';
