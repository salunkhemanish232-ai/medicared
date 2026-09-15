# Technology decision

## Current production stack

Medicare currently runs as a deliberately small, Render-compatible Node.js application:

- **Runtime and backend:** Node.js with the built-in HTTP server, REST-style API routes, validation, security headers, HTTP-only sessions, and role checks.
- **Frontend:** Semantic HTML, shared CSS, browser JavaScript, and a PWA shell. This keeps public pages fast and avoids adding a client bundle where it is not needed.
- **Data:** MySQL through `mysql2` when configured; persistent JSON fallback for local development and single-instance fallback deployments.
- **Authentication:** Session-based authentication with scrypt password hashing, role-based authorization, same-origin mutation checks, rate-limited login attempts, and private record filtering.
- **Deployment:** Render web service defined in `render.yaml`, with `/api/health` as the health check.
- **Testing:** Node smoke tests cover authentication, doctor authorization, patient isolation, token non-disclosure, and cross-origin mutation rejection.

## Why this is not a wholesale Next.js rewrite

The existing application is already operational and contains healthcare-sensitive authorization paths. A rewrite would create unnecessary risk around session handling, patient data isolation, appointment ownership, and deployment behavior. The project instructions also favor preserving a working stack where practical.

## Incremental modernization path

1. Keep `server.js` as the security boundary while the data model and permissions stabilize.
2. Move production persistence to PostgreSQL with a repository interface and Prisma migrations. Keep the JSON adapter only for local development.
3. Add TypeScript to backend modules behind the existing routes, starting with validation, auth, and authorization helpers.
4. Build new patient and doctor portal slices as React components, then mount them behind the existing routes after end-to-end parity tests pass.
5. Introduce Next.js only when server rendering, route-level code splitting, and the React portal surface justify the migration cost.

## Boundaries and known prerequisites

- The current app uses in-memory sessions. A multi-instance deployment requires a shared session store such as Redis or a database-backed session table.
- Password reset and email verification tokens are short-lived server-memory values and are not returned in API responses. A production email provider must be configured before those flows are used operationally.
- The current production database adapter is MySQL, not PostgreSQL. PostgreSQL and Prisma are a planned migration, not a claim about the current implementation.
- No AI model is used for diagnosis or unsupported medical prediction. Healthcare navigation is limited to verified hospital information and appointment assistance.
