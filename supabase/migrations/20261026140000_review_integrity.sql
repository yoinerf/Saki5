-- Reseñas honestas (auditoría 2026-10-26).
--   1. Un vendedor no puede reseñar sus propios productos (inflaba su calificación).
--   2. Cada reseña queda a nombre de quien la escribe (user_id = auth.uid()).
--   3. Calificación entre 1 y 5. NOT VALID: se exige a las reseñas nuevas y editadas sin revisar las
--      existentes (si alguna antigua estuviera fuera de rango, la migración no falla).
-- La app no cambia: ninguna pantalla deja reseñar productos propios a propósito.

begin;

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
  return new;
end;
$$;

drop trigger if exists trg_product_reviews_guard on public.product_reviews;
create trigger trg_product_reviews_guard
  before insert or update on public.product_reviews
  for each row execute function public.guard_product_review();

revoke execute on function public.guard_product_review() from public, anon, authenticated;

alter table public.product_reviews drop constraint if exists product_reviews_rating_range;
alter table public.product_reviews add constraint product_reviews_rating_range
  check (rating between 1 and 5) not valid;

commit;
