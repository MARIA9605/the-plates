# The Plates

Mobile-first meal-ordering website for Tuesday–Thursday service dates. Customers can review the week's menu, order until 9:00 PM IST the day before service, and cancel with their order ID and phone number until the same deadline. The Angular app includes a Supabase-backed admin dashboard for menus, capacity, and order history.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4200/`. The Supabase project URL and publishable key are already configured in the app.

## Connect Supabase

1. For a new database, run [`supabase_setup.sql`](./supabase_setup.sql) in the Supabase SQL Editor. For the existing database, run [`supabase_ordering_cancellation_migration.sql`](./supabase_ordering_cancellation_migration.sql) once before deploying the updated app.
2. Create one admin user in **Authentication → Users**, using a strong, unique password. Add that user to `kitchen_admins` using the final SQL statement in the setup file.
3. In [`src/app/app.ts`](./src/app/app.ts), set `ADMIN_AUTH_EMAIL` to the admin user's email.
4. Run `npm start` and test the site before deploying.

Only use the public anon/publishable key in browser code. Never put a Supabase `service_role` key in this app.

## Build and test

```bash
npm run build
npm test -- --watch=false
```
