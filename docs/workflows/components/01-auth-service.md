# Component · Auth Service (:8081)

**Responsibility:** registration, two-step login (password + **MFA code on every login**), JWT
issuance with a **roles claim**, email + SMS verification, full profile (view/edit/delete, masked
SSN/EIN), and the role-gated **Customer Care `/support` API** (see
[11-customer-care.md](11-customer-care.md)).
**Source:** [finance-mvp/apps/auth-service](../../../finance-mvp/apps/auth-service) · 🗄️ schema `auth`

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | create account (verified email+phone required by the web), auto-login, return JWT |
| POST | `/api/v1/auth/login` | **step 1**: verify password → sends OTP via the user's MFA channel (`mfaRequired=true`); returns token directly only if MFA is disabled |
| POST | `/api/v1/auth/mfa/verify` | **step 2**: exchange `{email, code}` for a JWT |
| POST | `/api/v1/auth/email/send` / `email/verify` | email verification code (signup/profile; dev returns `devCode`) |
| POST | `/api/v1/auth/sms/send` / `sms/verify` | phone verification code (dev returns `devCode`) |
| GET | `/api/v1/auth/validate` | validate a token |
| GET | `/api/v1/auth/me` | full profile (SSN/EIN **masked**, last-4 reveal only) |
| PUT | `/api/v1/auth/me` | update editable fields (name, phone, DOB, address, MFA channel) |
| DELETE | `/api/v1/auth/me` | permanently delete the signed-in user (hard delete) |
| — | `/api/v1/support/**` | Customer Care: search, member 360, activity, role grants ([details](11-customer-care.md)) |

## Data model

```mermaid
erDiagram
    USERS ||--o{ USER_ROLES : has
    USERS {
        bigint id PK
        string email UK
        string password_hash
        string name
        string first_name
        string last_name
        string phone
        date date_of_birth
        string address_fields "line1/line2/city/state/postal/country"
        string account_type "INDIVIDUAL|BUSINESS"
        string business_name
        string ssn_last4 "last 4 only"
        string ein_last4 "last 4 only"
        string mfa_channel "EMAIL|SMS"
        boolean email_verified
        boolean phone_verified
        boolean identity_verified
        timestamp created_at
        timestamp updated_at
    }
    USER_ROLES {
        bigint user_id FK
        string role "USER|CARE|ADMIN"
    }
```

## Login sequence (MFA on by default)

```mermaid
sequenceDiagram
    actor U as User
    participant AUTH as auth-service
    participant OTP as OtpService
    participant NOTIF as notification-service
    participant AUD as audit-service 🗄️
    U->>AUTH: POST /login {email, password}
    AUTH->>AUTH: bcrypt verify
    AUTH->>OTP: generate code for "mfa:{userId}"
    AUTH->>NOTIF: send OTP via user's channel (EMAIL or SMS)
    AUTH-->>U: { mfaRequired: true, channel, masked destination, devCode? }
    U->>AUTH: POST /mfa/verify {email, code}
    AUTH->>OTP: verify code
    AUTH->>AUTH: sign JWT (shared secret, 24h, sub + roles claim)
    AUTH-->>AUD: AuditClient → auth.login.success
    AUTH-->>U: { token, name, email }
    Note over AUTH: failures emit auth.login.failure (with attempted email)
```

- `mfaEnabled` config flag (on by default) — when off, `/login` returns the token directly.
- `exposeDevCode` echoes the OTP back in dev only; OTP delivery goes through notification-service
  (mock adapters today, Twilio/SendGrid when keyed).
- The JWT carries **`roles`** so every service can map them to `ROLE_*` authorities.

## Status / pending
- ✅ Two-step MFA login, register with email+phone verification, profile GET/PUT/DELETE (masked
  SSN/EIN), roles in JWT, auth domain events to audit-service, `/support` Customer Care API.
- ⬜ **Real SMS/email OTP providers** (dev returns the code; router is config-ready).
- ⬜ Password reset ("Forgot password?" link is UI-only today); session management / token revocation.
- ⬜ Account deletion is a **hard delete** — no soft-delete/retention (see [03](../03-data-persistence-and-audit.md)).
