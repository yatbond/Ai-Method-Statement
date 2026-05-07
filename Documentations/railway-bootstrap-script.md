# Railway Bootstrap Script

This repo includes an interactive setup helper for Railway deployments:

```bash
pnpm railway:bootstrap
```

By default it performs a dry run: it asks for service names and secret values,
then prints the variables that would be set on `ams-web` and `ams-worker`.
Secret values are masked in the output.

To apply the configuration, install and login to the Railway CLI first:

```bash
npm i -g @railway/cli
railway login
railway link
```

Then run:

```bash
pnpm railway:bootstrap -- --apply
```

The script will:

- set shared Postgres/Redis/R2/AI variables on `ams-web` and `ams-worker`;
- set Clerk and public URL variables only on `ams-web`;
- send secrets through stdin so they are not placed in command-line arguments;
- run Prisma migrations through Railway;
- redeploy the web and worker services.

For a fresh database where a failed Prisma migration has already been recorded,
run:

```bash
pnpm railway:bootstrap -- --apply --reset-failed-migration
```

Use `--reset-failed-migration` only when the Railway Postgres database is new
and has no useful application data yet.

Useful flags:

```bash
pnpm railway:bootstrap -- --help
pnpm railway:bootstrap -- --apply --skip-deploy
pnpm railway:bootstrap -- --apply --skip-migrate
```

