# The Plates

Mobile-first meal-ordering website for Tuesday–Thursday service dates. The Angular app includes a preview mode and a Supabase-backed admin dashboard for menus, capacity, and orders.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4200/`. The Supabase project URL and publishable key are already configured in the app.

## Connect Supabase

1. Run [`supabase_setup.sql`](./supabase_setup.sql) in the Supabase SQL Editor.
2. Create one admin user in **Authentication → Users**, using a strong, unique password. Add that user to `kitchen_admins` using the final SQL statement in the setup file.
3. In [`src/app/app.ts`](./src/app/app.ts), set `ADMIN_AUTH_EMAIL` to the admin user's email.
4. Run `npm start` and test the site before deploying.

Only use the public anon/publishable key in browser code. Never put a Supabase `service_role` key in this app.

## Build and test

```bash
npm run build
npm test -- --watch=false
```
