-- Índices para las consultas de la app y para las políticas RLS.
--
-- Postgres NO crea índices para las llaves foráneas. Sin ellos, cada consulta "por dueño" (mis pedidos,
-- mis favoritos, mis notificaciones, las ventas de un productor), cada política RLS que filtra por
-- usuario y cada borrado en cascada (borrar un usuario, un producto o un pedido) recorre la tabla
-- completa. Con pocos datos no se nota; crece con cada pedido y notificación.
--
-- Revisado contra las consultas de src/ (supabase.from(...).eq(...).order(...)) y las RPC/vistas de
-- supabase/migrations. Cada índice sigue el filtro + orden de una consulta real:
--   products            store + created_at       vitrina de cada tienda (MarketplaceScreen, HomeScreen)
--                       producer_id + created_at panel del productor (AdminPanelScreen), public_profiles
--   experiences         host_id + created_at     panel del anfitrión, public_profiles
--   images              product_id / experience_id   fotos de cada producto (todas las vitrinas, create_store_order)
--   orders              customer_id + created_at "Mis pedidos" (buyer.ts), RLS is_order_customer
--   order_items         order_id                 ítems de cada pedido (joins, RLS, notify-order, cascada)
--                       seller_id + created_at   pedidos y ventas del vendedor (orders.ts), RLS
--   order_item_status_history  order_item_id + created_at  historial de un ítem (orders.ts)
--   favorites           user_id + created_at     "Mis favoritos" (buyer.ts)
--   product_reviews     user_id                  "Mis reseñas" (BuyerPanelScreen), public_profiles
--   support_tickets     user_id + created_at     "Mis solicitudes" (buyer.ts)
--   user_notifications  user_id + created_at     campana de notificaciones (notifications.ts)
--                       created_at               limpieza diaria (cron cleanup-old-notifications)
--   activities          user_id + created_at     actividad reciente (HomeScreen, ProfileScreen, AdminPanelScreen)
--   profiles            store + user_type        productores de una tienda (StoreAdminScreen, RLS can_store_admin_manage)
--   y las llaves foráneas restantes que se usan en joins o borrados en cascada.
--
-- La base se creó desde el dashboard y no todos sus índices están en las migraciones. Para no duplicar
-- un índice que ya exista con otro nombre, ensure_index solo crea el índice si NINGÚN índice completo
-- (no parcial) de la tabla empieza por las mismas columnas. Si la tabla o una columna no existe, lo
-- omite con un aviso. Se puede ejecutar varias veces.
--
-- Sin CONCURRENTLY: las migraciones corren dentro de una transacción y las tablas son pequeñas
-- (el bloqueo dura milisegundos). Si una tabla llega a millones de filas, crear el índice a mano con
-- "create index concurrently" fuera de una transacción.

begin;

create or replace function pg_temp.ensure_index(p_table text, p_cols text[], p_name text, p_def text)
returns void
language plpgsql
as $$
declare
  v_rel regclass := to_regclass('public.' || p_table);
  v_attnums int2[];
  v_col text;
  v_attnum int2;
begin
  if v_rel is null then
    raise notice 'ensure_index: no existe la tabla %, se omite %', p_table, p_name;
    return;
  end if;

  foreach v_col in array p_cols loop
    select attnum into v_attnum
    from pg_attribute
    where attrelid = v_rel and attname = v_col and not attisdropped;
    if v_attnum is null then
      raise notice 'ensure_index: no existe la columna %.%, se omite %', p_table, v_col, p_name;
      return;
    end if;
    v_attnums := v_attnums || v_attnum;
  end loop;

  -- ¿Ya hay un índice (PK, unique u otro) cuyas primeras columnas son estas?
  if exists (
    select 1 from pg_index i
    where i.indrelid = v_rel
      and i.indisvalid
      and i.indpred is null
      and (i.indkey::int2[])[0:cardinality(v_attnums) - 1] = v_attnums
  ) then
    raise notice 'ensure_index: % ya está cubierto por un índice existente', p_name;
    return;
  end if;

  execute format('create index if not exists %I on public.%I (%s)', p_name, p_table, p_def);
end;
$$;

-- ─── Catálogo ─────────────────────────────────────────────────────────────────
select pg_temp.ensure_index('products', array['store', 'created_at'], 'products_store_created_at_idx', 'store, created_at desc');
select pg_temp.ensure_index('products', array['producer_id', 'created_at'], 'products_producer_id_created_at_idx', 'producer_id, created_at desc');
select pg_temp.ensure_index('products', array['category_id'], 'products_category_id_idx', 'category_id');

select pg_temp.ensure_index('experiences', array['host_id', 'created_at'], 'experiences_host_id_created_at_idx', 'host_id, created_at desc');
select pg_temp.ensure_index('experiences', array['category_id'], 'experiences_category_id_idx', 'category_id');

select pg_temp.ensure_index('images', array['product_id'], 'images_product_id_idx', 'product_id, is_primary desc, sort_order');
select pg_temp.ensure_index('images', array['experience_id'], 'images_experience_id_idx', 'experience_id, is_primary desc, sort_order');

select pg_temp.ensure_index('advertisements', array['product_id'], 'advertisements_product_id_idx', 'product_id');
select pg_temp.ensure_index('advertisements', array['experience_id'], 'advertisements_experience_id_idx', 'experience_id');

-- product_reviews (product_id, user_id) ya es único (upsert onConflict 'product_id,user_id')
select pg_temp.ensure_index('product_reviews', array['product_id'], 'product_reviews_product_id_created_at_idx', 'product_id, created_at desc');
select pg_temp.ensure_index('product_reviews', array['user_id'], 'product_reviews_user_id_idx', 'user_id');

-- ─── Pedidos ──────────────────────────────────────────────────────────────────
select pg_temp.ensure_index('orders', array['customer_id', 'created_at'], 'orders_customer_id_created_at_idx', 'customer_id, created_at desc');
select pg_temp.ensure_index('orders', array['store'], 'orders_store_idx', 'store');

select pg_temp.ensure_index('order_items', array['order_id'], 'order_items_order_id_idx', 'order_id');
select pg_temp.ensure_index('order_items', array['seller_id', 'created_at'], 'order_items_seller_id_created_at_idx', 'seller_id, created_at desc');
select pg_temp.ensure_index('order_items', array['product_id'], 'order_items_product_id_idx', 'product_id');
select pg_temp.ensure_index('order_items', array['experience_id'], 'order_items_experience_id_idx', 'experience_id');

select pg_temp.ensure_index('order_item_status_history', array['order_item_id', 'created_at'], 'order_item_status_history_item_created_at_idx', 'order_item_id, created_at');
select pg_temp.ensure_index('order_item_status_history', array['order_id'], 'order_item_status_history_order_id_idx', 'order_id');
select pg_temp.ensure_index('order_item_status_history', array['changed_by'], 'order_item_status_history_changed_by_idx', 'changed_by');

select pg_temp.ensure_index('order_status_transitions', array['store', 'from_status_id'], 'order_status_transitions_store_from_idx', 'store, from_status_id');

-- ─── Cuenta del comprador ─────────────────────────────────────────────────────
select pg_temp.ensure_index('favorites', array['user_id', 'created_at'], 'favorites_user_id_created_at_idx', 'user_id, created_at desc');
select pg_temp.ensure_index('favorites', array['product_id'], 'favorites_product_id_idx', 'product_id');
select pg_temp.ensure_index('favorites', array['experience_id'], 'favorites_experience_id_idx', 'experience_id');

select pg_temp.ensure_index('support_tickets', array['user_id', 'created_at'], 'support_tickets_user_id_created_at_idx', 'user_id, created_at desc');
select pg_temp.ensure_index('support_tickets', array['order_id'], 'support_tickets_order_id_idx', 'order_id');
select pg_temp.ensure_index('support_tickets', array['order_item_id'], 'support_tickets_order_item_id_idx', 'order_item_id');

-- ─── Notificaciones y actividad ───────────────────────────────────────────────
select pg_temp.ensure_index('user_notifications', array['user_id', 'created_at'], 'user_notifications_user_id_created_at_idx', 'user_id, created_at desc');
select pg_temp.ensure_index('user_notifications', array['created_at'], 'user_notifications_created_at_idx', 'created_at');
select pg_temp.ensure_index('user_notifications', array['entity_id'], 'user_notifications_entity_id_idx', 'entity_id');
select pg_temp.ensure_index('user_notifications', array['store'], 'user_notifications_store_idx', 'store');

select pg_temp.ensure_index('activities', array['user_id', 'created_at'], 'activities_user_id_created_at_idx', 'user_id, created_at desc');

-- ─── Perfiles y documentos ────────────────────────────────────────────────────
select pg_temp.ensure_index('profiles', array['store', 'user_type'], 'profiles_store_user_type_idx', 'store, user_type');
select pg_temp.ensure_index('profiles', array['manually_verified_by'], 'profiles_manually_verified_by_idx', 'manually_verified_by');

select pg_temp.ensure_index('producer_documents', array['producer_id'], 'producer_documents_producer_id_idx', 'producer_id, doc_type');
select pg_temp.ensure_index('producer_documents', array['reviewed_by'], 'producer_documents_reviewed_by_idx', 'reviewed_by');

-- Estadísticas al día para que el planificador use los índices nuevos
analyze public.products, public.experiences, public.images, public.orders, public.order_items,
  public.order_item_status_history, public.favorites, public.product_reviews, public.support_tickets,
  public.user_notifications, public.activities, public.profiles, public.producer_documents;

commit;
