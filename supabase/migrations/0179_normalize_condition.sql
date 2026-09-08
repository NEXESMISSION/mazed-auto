-- ============================================================================
-- « Neuf ou occasion » — make the answer exist before filtering on it.
--
-- `attributes->>'condition'` holds five different values across the catalogue:
-- `new`, `used` and `refurbished`, which are the three the publish form
-- offers — and `good`, `fair` and `excellent`, which it never has. Those three
-- came in with the import, and they are not the same QUESTION: good/fair/
-- excellent grade how worn a car is, while new/used says whether it has been
-- owned. 52 of the 58 published cars carry a grade, so a « Neuf / Occasion »
-- filter built today would have matched almost nothing and looked broken.
--
-- A car that is `good`, `fair` or `excellent` is, in every case, a car that has
-- been owned. They fold to `used`. The grade itself is not preserved: nothing
-- in the product ever read it, no form can set it, and keeping a dead third
-- axis around invites someone to filter on it later and find it half-populated.
-- ============================================================================

update public.listings
   set attributes = jsonb_set(attributes, '{condition}', '"used"'),
       updated_at = now()
 where attributes ? 'condition'
   and attributes->>'condition' in ('good', 'fair', 'excellent');

-- Anything left is one of the three the form can produce. The constraint is
-- what stops the next importer reintroducing a fourth.
alter table public.listings
  drop constraint if exists listings_condition_known;

alter table public.listings
  add constraint listings_condition_known
  check (
    not (attributes ? 'condition')
    or attributes->>'condition' in ('new', 'used', 'refurbished')
  )
  not valid;

-- `not valid` above, validated here: the check runs against existing rows only
-- once, and separately, so a single bad legacy row cannot block the migration
-- from installing the guard for everything that comes next.
alter table public.listings validate constraint listings_condition_known;

-- The filter's query is `attributes @> {"condition": ...}`, which a jsonb
-- containment index answers directly.
create index if not exists listings_attributes_gin
  on public.listings using gin (attributes jsonb_path_ops);

notify pgrst, 'reload schema';
