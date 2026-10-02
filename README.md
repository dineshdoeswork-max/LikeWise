# CleanRoute

CleanRoute is a smart waste-pickup planning website for citizens, dispatch administrators, and garbage-truck crews. Citizens report visible waste on a map, the system scores each report, and an administrator creates a capacity-safe morning plan for a collection team. The collector then follows the numbered loads and records completed pickups.

The included sample workspace covers Bandra and Khar in Mumbai. Its reports are illustrative demo data, not municipal records.

## What the website does

### Citizen collection map

- Shows every reported pickup as a colour-coded marker: red is high priority, amber is medium, and green is low.
- Lets a citizen click **Request a pickup**, choose the exact map location, describe the waste type, estimate the number of standard bags, and state urgency.
- Returns a request ID that can be entered in **Track a request** to see whether the report is pending, scheduled, or collected.
- Does not collect a citizen's name, phone number, or photo.

### Administrator workspace

- Lists reports by location, waste type, priority, status, and assigned team.
- Assigns work to a collection team.
- Accepts the truck's bag capacity and the available morning shift in minutes.
- Creates the morning plan, dispatches only stops that fit, and leaves overflow work pending for a later shift.

### Collector workspace

- Shows the route as numbered stops and coloured depot-to-depot trips.
- Displays planned distance, approximate time, total bags, number of loads, and capacity.
- Lets the crew mark each stop as collected. Citizens see that status through the tracker.

## How morning route planning works

The planner solves a practical heuristic version of a capacity-constrained vehicle-routing problem. It is designed to make a useful plan quickly in the browser; it is not a mathematical proof of the globally shortest route.

1. Only incomplete requests assigned to the selected team are considered.
2. Every request receives a live score:

   `priority score = urgency × 3 + age in days × 2 + estimated bags`

3. A score of 12 or more is high priority, 7–11.99 is medium, and less than 7 is low.
4. Higher-priority bands are planned first. Within a band, the planner compares the priority/volume value with the travel cost from the truck's current position. This favours large and urgent piles while avoiding wasteful detours.
5. A pickup is never added when it would exceed the truck's bag capacity. The truck returns to the depot to unload, and a new trip begins.
6. Every candidate is checked against the shift limit, including seven minutes of service time at each stop and the final return to the depot. The estimate assumes an average city speed of 18 km/h.
7. Requests that do not fit remain pending instead of overfilling the truck or producing an impossible schedule.

Distance is calculated with the Haversine formula. The displayed lines are straight-line planning estimates, not turn-by-turn road navigation, live traffic guidance, or guaranteed arrival times. A production municipality should connect a road-routing service before crews use the plan for navigation.

## Map and CARTO setup

The map uses Leaflet with CARTO raster basemaps and OpenStreetMap data. Put a browser-safe CARTO access token in `.env.local`:

```dotenv
NEXT_PUBLIC_CARTO_API_KEY=your_browser_safe_carto_token
```

Restart `npm run dev` after changing an environment variable. Variables beginning with `NEXT_PUBLIC_` are included in browser code, so never put a CARTO secret intended only for a server in this field. The supplied basemap key is sent as `?key=...` to CARTO's Voyager tile endpoint, following [CARTO's setup guide](https://www.carto.com/basemaps/apikey/). `api_key` is not the basemap parameter: it results in an "API key required" placeholder that can still return HTTP 200.

Without a key, CleanRoute uses OpenStreetMap. Failed or stalled CARTO requests also fall back to OpenStreetMap. The map's background selector allows switching providers manually; its connection indicator, retry button, and fit-all-pickups control help recover or navigate. A resize observer keeps tiles aligned when the layout changes between desktop and mobile.

The map still needs an internet connection. Browser privacy extensions, a corporate firewall, or a deployment Content Security Policy must allow `*.basemaps.cartocdn.com` and `tile.openstreetmap.org`.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by Next.js. Without Supabase browser credentials, the app starts in **Demo workspace** mode. Demo changes are stored in that browser's `localStorage` and are not shared with other devices.

Useful checks:

```bash
npm test
npm run lint
npm run build
```

## Typical end-to-end workflow

1. A citizen selects **Request a pickup**, clicks a point on the map, enters the waste details, and saves the generated request ID.
2. An administrator opens **Admin**, assigns pending reports to a team, enters the truck capacity and shift duration, and selects **Plan morning route**.
3. CleanRoute scores the work, selects what fits, divides it into safe loads, saves the ordered stop IDs, and changes the selected requests to `in-progress`.
4. A collector opens **Collector**, follows each trip from the depot, and marks stops collected.
5. The citizen enters the request ID in **Track a request** and sees the updated state.

## Shared Supabase setup

Demo mode is enough to explore the product. For shared live data and staff accounts:

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Set `DATABASE_URL`, then run `npm run db:setup` once against an empty project. Alternatively, run `supabase/schema.sql` in the SQL Editor.
4. Set these browser-safe values:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
   ```

5. Create staff users in Supabase Authentication and set administrator-controlled `app_metadata` (never editable `user_metadata`) using the Admin API or SQL:

   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
   where email = 'admin@example.com';

   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"collector","team_id":"team-a"}'::jsonb
   where email = 'collector@example.com';
   ```

6. Restart the app and sign in again after changing role claims.

If the schema was installed before capacity-aware planning was added, rerun the `create or replace function public.save_route...` section from `supabase/schema.sql`. The current function permits a safe subset of assigned requests to be dispatched while verifying that every saved ID still belongs to the team.

## Data model and security

- `requests`: coordinates, area label, waste type, urgency, bag estimate, status, creation time, and optional team assignment.
- `teams`: team name and depot coordinates.
- `routes`: one current plan per team, containing ordered request IDs and estimated total distance.

PostgreSQL Row Level Security is authoritative. Anonymous citizens can read the public collection map and insert only the allowed report fields. Collectors can read their team's route and can only change their own dispatched requests from `in-progress` to `done`. Administrators manage teams, assignments, and dispatch. Route saving is atomic and rejects stale or foreign request IDs. Supabase Realtime tells connected clients to refresh request and route data.

Public request coordinates are intentional in this concept. Before a public deployment, define location-data retention, add rate limiting or CAPTCHA, verify policies with multiple accounts, and review whether exact coordinates should be blurred after collection.

## Project structure

```text
app/
  layout.tsx                 Page metadata and global stylesheet
  page.tsx                   Next.js entry point
  globals.css                Responsive interface and Leaflet styles
src/
  components/CollectionMap.jsx  CARTO/OSM map, pins, depot and trip lines
  views/WasteApp.jsx            Citizen, admin, collector and tracker UI
  lib/demo.js                   Sample Mumbai teams and requests
  lib/supabase.js               Environment-based Supabase client/fallback
  utils/optimizer.js            Scoring and capacity/shift route planner
  utils/optimizer.test.js       Planner unit tests
supabase/schema.sql              Tables, constraints, RLS, triggers and RPC
.env.example                     Environment variable template
```

## Current limitations

- Bag count is a human estimate, not measured truck weight or volume.
- Haversine distances do not understand roads, one-way streets, traffic, vehicle restrictions, or disposal-site queues.
- The current database stores the route's ordered IDs and distance; capacity trip groups are reconstructed in the UI from the configured/default capacity.
- Demo mode is single-browser only, and live authentication/RLS/Realtime need a configured Supabase project for integration testing.
- For production, store truck capacity, shift settings, trip boundaries, plan timestamps, and audit history in dedicated database columns rather than only in the live route result.

CleanRoute is therefore a transparent planning prototype: it makes priority, capacity, and time assumptions visible instead of claiming a road-perfect route.
