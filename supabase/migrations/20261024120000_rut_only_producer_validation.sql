-- Solo el RUT es obligatorio para verificar a un productor.
-- Antes is_producer_validated exigía el RUT y la Cámara de Comercio aprobados. Ahora basta con
-- el RUT aprobado (o la verificación manual del superadmin); la Cámara de Comercio se puede
-- seguir cargando y revisando, pero es opcional. enforce_producer_validated usa esta función
-- para permitir publicar productos y experiencias.
-- Debe coincidir con REQUIRED_DOCS en src/lib/producerDocuments.ts.

begin;

create or replace function public.is_producer_validated(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
      select 1 from public.profiles
      where id = p_user and manually_verified_at is not null
    )
    or exists (
      select 1 from public.producer_documents
      where producer_id = p_user
        and status = 'aprobado'
        and doc_type = 'rut'
    );
$$;

-- Texto de la notificación al retirar la verificación manual
create or replace function public.set_producer_manual_verification(p_producer uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Solo un superadministrador puede verificar productores manualmente';
  end if;

  select user_type into v_type from public.profiles where id = p_producer for update;
  if not found then
    raise exception 'El usuario no existe';
  end if;
  if v_type not in ('asociacion', 'turismo') then
    raise exception 'Solo se pueden verificar productores (Asociación o Turismo)';
  end if;

  update public.profiles set
    manually_verified_at = case when p_verified then now() else null end,
    manually_verified_by = case when p_verified then auth.uid() else null end
  where id = p_producer;

  begin
    if to_regclass('public.user_notifications') is not null then
      insert into public.user_notifications (user_id, type, title, body, link_tab, link_section, entity_id)
      values (
        p_producer, 'document_review',
        case when p_verified then 'Perfil verificado' else 'Verificación retirada' end,
        case when p_verified
          then 'Un administrador verificó tu perfil. Ya puedes publicar.'
          else 'Un administrador retiró la verificación manual de tu perfil. Para publicar necesitas el RUT aprobado.' end,
        'admin', 'settings', p_producer
      );
    end if;
  exception when others then
    null;
  end;
end;
$$;

comment on column public.profiles.manually_verified_at is
  'Productor verificado manualmente por un superadmin (sin exigir el RUT). null = no.';

commit;
