# Architecture

Browser → React views → Supabase JS client → PostgREST / PostgreSQL.
Supabase Auth supplies staff JWTs; PostgreSQL RLS enforces authorization independently of the interface. Supabase Realtime changes trigger fresh reads. Public map and tracker read request records. The route optimizer runs in JavaScript; admin-only save_route validates membership and writes route + dispatched statuses in one transaction.

Without configuration, an explicit demo adapter uses localStorage for requests, teams and routes. It does not claim multiuser persistence or authentication. No credentials are bundled.

## Data

Request: requested fields plus optional landmark text. UUID-derived public request identifier. Team: text ID, name, depot coordinates. Route: one current plan per team, ordered request IDs and total straight-line distance. Completion preserves route history until the next optimization. Assignment changes invalidate plans. Database checks reject invalid coordinates, statuses, waste types, urgency and volume.

## Access

Anon citizen: select public requests/teams, insert allowed request fields. Authenticated collector: read own team's route; update only own dispatched request status to done. Admin: manage assignments, team CRUD and dispatch routes via RPC. Role and team claims live in app_metadata. Public map intentionally exposes locations; it collects no names, phone numbers or photos.

## UI

Collection map is the primary workspace. Desktop has an adjacent pickup list; mobile stacks it below the map. Request, status and login forms use bottom sheets on mobile. Admin tables become cards. Important touch actions have 44px targets. Loading, empty, tile failure, mutation failure and submission success states are included.

## Limits

Nearest neighbor is a heuristic; priority bands trade distance for urgency. No road network, traffic, truck capacity, ETA, route navigation or fuel savings are implied. No unverified IoT or city-wide utility data from the reference documents is included. Production Supabase requires configuration, deployment environment variables, and multi-account policy verification. Public anti-spam infrastructure is a deployment follow-up.
