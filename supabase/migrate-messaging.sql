-- ============================================================
-- Mazed Auto — buyer ↔ seller messaging
-- Conversations + messages tables, RLS so only participants can
-- read/write, realtime publication for live message delivery.
-- Safe to run repeatedly.
-- ============================================================

-- 1) Conversations
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references auth.users(id) on delete cascade,
  seller_id       uuid not null references auth.users(id) on delete cascade,
  auction_id      uuid references public.auctions(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  -- One conversation per (buyer, seller, auction) tuple
  unique (buyer_id, seller_id, auction_id)
);

create index if not exists idx_conversations_buyer
  on public.conversations(buyer_id, last_message_at desc);
create index if not exists idx_conversations_seller
  on public.conversations(seller_id, last_message_at desc);

-- 2) Messages
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conv
  on public.messages(conversation_id, created_at);

-- 3) Bump last_message_at whenever a new message is inserted
create or replace function public.bump_conversation_last_message()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end; $$;

drop trigger if exists trg_bump_last_message on public.messages;
create trigger trg_bump_last_message
after insert on public.messages
for each row execute function public.bump_conversation_last_message();

-- 4) RLS
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

drop policy if exists "conversations_participant_read" on public.conversations;
create policy "conversations_participant_read"
on public.conversations for select
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "conversations_participant_insert" on public.conversations;
create policy "conversations_participant_insert"
on public.conversations for insert
with check (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "messages_participant_read" on public.messages;
create policy "messages_participant_read"
on public.messages for select
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

drop policy if exists "messages_participant_insert" on public.messages;
create policy "messages_participant_insert"
on public.messages for insert
with check (
  sender_id = auth.uid() and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

-- Marking own messages as read (recipient updates read_at)
drop policy if exists "messages_participant_mark_read" on public.messages;
create policy "messages_participant_mark_read"
on public.messages for update
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

-- 5) Realtime — broadcast inserts so the recipient's open chat updates live.
-- Wrap in DO blocks so re-running doesn't raise
-- "relation already member of publication" (42710).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;
