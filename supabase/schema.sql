-- Run once in a new Supabase project's SQL Editor.
create table public.teams (
 id text primary key, name text not null check (char_length(name) between 1 and 60),
 "startLat" double precision not null check ("startLat" between -90 and 90),
 "startLng" double precision not null check ("startLng" between -180 and 180)
);
create table public.requests (
 id text primary key default ('CR-' || upper(replace(gen_random_uuid()::text,'-',''))),
 lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180),
 location text not null default 'Map pickup' check(char_length(location) between 1 and 120),
 "wasteType" text not null check("wasteType" in ('Wet','Dry','Mixed','E-waste')),
 urgency integer not null check(urgency between 1 and 3),
 "volumeEst" integer not null check("volumeEst" between 1 and 50),
 status text not null default 'pending' check(status in ('pending','in-progress','done')),
 "createdAt" timestamptz not null default now(),
 "assignedTeam" text references public.teams(id)
);
create table public.routes (
 "teamId" text primary key references public.teams(id),
 "orderedRequestIds" text[] not null,
 "totalDistanceKm" double precision not null check("totalDistanceKm">=0 and "totalDistanceKm"<'Infinity'::double precision)
);
create index requests_team_status on public.requests("assignedTeam",status);
create index requests_created on public.requests("createdAt");
alter table public.requests enable row level security;
alter table public.teams enable row level security;
alter table public.routes enable row level security;
-- Roles and team IDs are stored in administrator-controlled app_metadata.
create function public.is_admin() returns boolean language sql stable as $$
 select coalesce(auth.jwt()->'app_metadata'->>'role'='admin',false)
$$;
create policy requests_read on public.requests for select to anon,authenticated using(true);
create policy citizen_insert on public.requests for insert to anon,authenticated with check(status='pending' and "assignedTeam" is null);
create policy admin_update on public.requests for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy collector_update on public.requests for update to authenticated
 using(auth.jwt()->'app_metadata'->>'role'='collector' and "assignedTeam"=auth.jwt()->'app_metadata'->>'team_id' and status='in-progress')
 with check(auth.jwt()->'app_metadata'->>'role'='collector' and "assignedTeam"=auth.jwt()->'app_metadata'->>'team_id' and status='done');
create policy teams_read on public.teams for select to anon,authenticated using(true);
create policy teams_admin on public.teams for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy routes_read on public.routes for select to authenticated using(public.is_admin() or (auth.jwt()->'app_metadata'->>'role'='collector' and "teamId"=auth.jwt()->'app_metadata'->>'team_id'));
-- Limit INSERT fields so callers cannot choose IDs, timestamps, status or team.
revoke all on public.requests,public.teams,public.routes from anon,authenticated;
grant select on public.requests,public.teams,public.routes to anon,authenticated;
grant insert(lat,lng,location,"wasteType",urgency,"volumeEst") on public.requests to anon,authenticated;
grant update on public.requests to authenticated;
grant insert,update,delete on public.teams to authenticated;
-- Collector row access does not imply permission to alter coordinates or urgency.
create function public.guard_request_update() returns trigger language plpgsql set search_path=public as $$
begin
 if not public.is_admin() and (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
  raise exception 'Collectors may only update collection status';
 end if;
 return new;
end $$;
create trigger protect_request before update on public.requests for each row execute function public.guard_request_update();
-- Assignment changes invalidate both routes. Completion preserves route history.
create function public.invalidate_routes() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old."assignedTeam" is distinct from new."assignedTeam" then
  delete from public.routes where "teamId"=old."assignedTeam" or "teamId"=new."assignedTeam";
 end if;
 return new;
end $$;
create trigger invalidate_assignment_route after update on public.requests for each row execute function public.invalidate_routes();
-- Atomically persist route and dispatch its requests; reject stale assignments.
create function public.save_route(p_team text,p_ids text[],p_distance double precision) returns void
language plpgsql security definer set search_path=public as $$
declare invalid_count integer;
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 perform 1 from public.teams where id=p_team for update;
 if not found then raise exception 'Team does not exist'; end if;
 perform 1 from public.requests where "assignedTeam"=p_team and status<>'done' for update;
 select count(*) into invalid_count from unnest(p_ids) as requested(request_id)
 left join public.requests r on r.id=requested.request_id
 where r.id is null or r."assignedTeam"<>p_team or r.status='done';
 if cardinality(p_ids)=0 or invalid_count>0 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then
  raise exception 'Route contains an unavailable request. Refresh and optimize again.';
 end if;
 insert into public.routes values(p_team,p_ids,p_distance)
 on conflict("teamId") do update set "orderedRequestIds"=excluded."orderedRequestIds","totalDistanceKm"=excluded."totalDistanceKm";
 update public.requests set status='in-progress' where id=any(p_ids);
end $$;
revoke all on function public.save_route(text,text[],double precision) from public,anon;
grant execute on function public.save_route(text,text[],double precision) to authenticated;
-- Realtime reads are still subject to SELECT policies.
alter publication supabase_realtime add table public.requests,public.routes;
insert into public.teams values ('team-a','Team Alpha',19.065,72.835),('team-b','Team Bravo',19.080,72.847);
