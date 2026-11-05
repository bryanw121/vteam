import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findDestructive } from './migration-safety.mjs'

test('additive migrations pass', () => {
  assert.deepEqual(findDestructive(`
    create table if not exists public.foo (id bigint primary key, name text);
    alter table public.events add column if not exists surface text;
    alter table public.events add column level text not null default 'all';
    create index if not exists foo_name on public.foo (name);
    grant select on public.foo to anon;
  `), [])
})

test('destructive statements are flagged', () => {
  const p = findDestructive(`
    alter table public.events drop column price;
    alter table public.events rename column title to name;
    alter table public.events alter column max_attendees type bigint;
    alter table public.events alter column location set not null;
    alter table public.events add column region text not null;
  `)
  assert.equal(p.length, 5)
  assert.match(p.join('\n'), /drops an object/)
  assert.match(p.join('\n'), /renames something/)
  assert.match(p.join('\n'), /changes a column type/)
  assert.match(p.join('\n'), /makes a column required/)
  assert.match(p.join('\n'), /required column without a default/)
})

test('function bodies and comments are ignored', () => {
  assert.deepEqual(findDestructive(`
    -- drop table old_stuff (that was last week)
    create or replace function public.f() returns void language plpgsql as $fn$
    begin
      create temp table t (x int);
      drop table t;
    end $fn$;
  `), [])
})

test('drop-and-recreate in the same file is a replacement, not a removal', () => {
  assert.deepEqual(findDestructive(`
    drop policy if exists "Members read" on public.clubs;
    create policy "Members read" on public.clubs for select using (true);
    drop trigger if exists trg_x on public.events;
    create trigger trg_x after insert on public.events for each row execute function public.f();
  `), [])
  assert.equal(findDestructive('drop policy if exists "Members read" on public.clubs;').length, 1)
})

test('a contract marker opts out', () => {
  assert.deepEqual(findDestructive(`
    -- contract: no deployed code reads events.legacy_flag since #120
    alter table public.events drop column legacy_flag;
  `), [])
})
