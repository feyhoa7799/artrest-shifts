# Upstream pin

The test deployment must be based on the official Supabase Docker configuration.

- Repository: `https://github.com/supabase/supabase.git`
- Commit inspected: `6119ea1eb51005a5c6e172c75bcc954c622ff4cd`
- Inspection date: 2026-10-09
- PostgreSQL image: `supabase/postgres:17.6.1.136`
- GoTrue image: `supabase/gotrue:v2.196.0`
- PostgREST image: `postgrest/postgrest:v14.17`
- API gateway image: `envoyproxy/envoy:v1.39.1`

Do not deploy from a floating `master` checkout. Clone the repository, checkout this commit, and review upstream security updates immediately before the test deployment. Updating the pin requires a separate review and a restore test.

