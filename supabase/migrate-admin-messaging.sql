-- ============================================================
-- Mazed Auto — Messaging moderation
--
-- conversations + messages have strict participant-only RLS. For
-- abuse / harassment investigations admins need to read any thread,
-- but every read must be auditable.
--
-- This migration adds three SECURITY DEFINER RPCs that bypass RLS
-- AND record an `admin_audit_log` row tagged with the moderation
-- reason. Without the reason the RPC refuses to return rows.
--
-- Depends on: migrate-admin-foundations.sql, migrate-messaging.sql
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.admin_list_conversations(
  p_search text default null,
  p_limit  int default 100
) returns table (
  id              uuid,
  buyer_id        uuid,
  seller_id       uuid,
  auction_id      uuid,
  last_message_at timestamptz,
  created_at      timestamptz,
  message_count   bigint,
  buyer_label     text,
  seller_label    text,
  auction_title   text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('message.read_for_moderation') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    c.id,
    c.buyer_id,
    c.seller_id,
    c.auction_id,
    c.last_message_at,
    c.created_at,
    (select count(*) from public.messages m where m.conversation_id = c.id),
    coalesce(
      (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data->>'lastName',''))
         from auth.users u where u.id = c.buyer_id),
      'Acheteur')::text,
    coalesce(
      (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data->>'lastName',''))
         from auth.users u where u.id = c.seller_id),
      'Vendeur')::text,
    coalesce(
      (select a.make || ' ' || a.model || ' ' || a.year::text
         from public.auctions a where a.id = c.auction_id),
      '—')::text
  from public.conversations c
  where p_search is null
     or coalesce((select email from auth.users where id = c.buyer_id),'')  ilike '%' || p_search || '%'
     or coalesce((select email from auth.users where id = c.seller_id),'') ilike '%' || p_search || '%'
  order by coalesce(c.last_message_at, c.created_at) desc
  limit greatest(0, p_limit);
end; $$;
grant execute on function public.admin_list_conversations(text, int) to authenticated;

create or replace function public.admin_read_conversation(
  p_conversation_id uuid,
  p_reason          text
) returns table (
  id              uuid,
  sender_id       uuid,
  sender_label    text,
  body            text,
  read_at         timestamptz,
  created_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('message.read_for_moderation') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  perform public.log_admin_action(
    'message.read_for_moderation',
    p_target_id   => p_conversation_id,
    p_target_type => 'conversation',
    p_detail      => p_reason
  );

  return query
  select
    m.id,
    m.sender_id,
    coalesce(
      (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data->>'lastName',''))
         from auth.users u where u.id = m.sender_id),
      'Utilisateur')::text,
    m.body,
    m.read_at,
    m.created_at
  from public.messages m
  where m.conversation_id = p_conversation_id
  order by m.created_at asc;
end; $$;
grant execute on function public.admin_read_conversation(uuid, text) to authenticated;
