# Yandex SmartCaptcha cutover

This change moves password login, registration email code delivery, and
password recovery behind application API routes. The routes validate a
one-time Yandex SmartCaptcha token before calling Supabase Auth.

## Required environment

```env
NEXT_PUBLIC_YANDEX_SMARTCAPTCHA_SITE_KEY=ysc1_oU7uW0mr8hoEhl6omcNdAEzINeaJ2a40cBT49Nb6991907a9
YANDEX_SMARTCAPTCHA_SERVER_KEY=<set securely on the server>
SUPABASE_INTERNAL_URL=<internal GoTrue/Kong URL>
APP_BASE_URL=https://podrabotka.art-rest.com
```

Never print or commit the server key.

## Required gateway protection

Yandex SmartCaptcha is validated by the application, not by GoTrue. At the
self-hosted Supabase cutover, direct public access to the following sensitive
GoTrue operations must be blocked while the application keeps access through
`SUPABASE_INTERNAL_URL`:

- `POST /auth/v1/otp`
- `POST /auth/v1/recover`
- `POST /auth/v1/token?grant_type=password`

Do not block token refresh, OTP verification, authenticated user operations,
or password recovery verification. The exact Nginx rules must be reviewed
against the final self-hosted gateway topology before production deployment.

Without this gateway restriction, an attacker could call GoTrue directly and
bypass the application-level CAPTCHA.

## Release order

1. Confirm the CAPTCHA allowed-sites list contains
   `podrabotka.art-rest.com` and the test host used for smoke testing.
2. Put the server key and internal Supabase URL into the test environment.
3. Apply and verify the gateway restrictions in the test environment.
4. Disable the old GoTrue Turnstile/hCaptcha provider in the self-hosted test
   Auth configuration. Do this only after the gateway restrictions are active;
   otherwise the server routes cannot call GoTrue, or direct Auth calls become
   an unprotected CAPTCHA bypass.
5. Test registration code delivery, password login, password recovery, OTP
   verification, session refresh, and password update.
6. Only then prepare one production window for the self-hosted Auth cutover,
   gateway restrictions, and application deployment.

The integration fails closed: if SmartCaptcha is unavailable or not
configured, protected authentication requests are rejected rather than
allowed through.
