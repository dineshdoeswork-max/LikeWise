# Implementation and launch plan

1. Foundation: React UI, shared data model, deliberate demo mode, map tile attribution.
2. Citizen flow: map pin, waste form, validated volume and urgency, request ID and status tracker.
3. Operations: request filtering, admin assignment, team depots and priority scoring.
4. Routing: high-to-low priority bands, nearest neighbor, Haversine distance, route polyline and numbered stops.
5. Collector: authenticated team route, single-action completion and status updates.
6. Backend: Supabase schema, RLS, collector field guard, atomic route dispatch and Realtime publication.
7. Verification: deterministic optimizer tests, production build. After connecting Supabase, verify two citizen sessions see new reports and two collector accounts cannot update each other's requests. Confirm failed/non-admin RPC calls and forbidden field edits are rejected.
8. Launch: configure Supabase values and staff accounts, add rate limiting for public intake, verify mobile map/network access, then grant the intended audience access.

The included implementation completes steps 1–6 and local automated checks. Supabase account provisioning and live backend verification remain deployment-specific because no project credentials were supplied.
