# .NET + SQL Server local dev starter

Reusable docker-compose template: SQL Server 2022 + Azurite (blob/queue/table
emulator) + .NET Web API with EF Core migrations-on-startup + a DevSeed
service that creates a user + API key on first boot.

## Run

```bash
cp .env.example .env   # optional — defaults work as-is
make start              # docker compose up --build -d
make logs                # follow logs, watch for the DevSeed-printed API key
make down                # stop
make clean                # stop + remove volumes (wipes the DB)
```

API comes up on http://localhost:8080 — try `GET /health` and `GET /users`.

## Structure

- `docker-compose.yml` — sqlserver (with a real healthcheck the API waits
  on), azurite, and the api service.
- `api/Dockerfile` — multi-stage build (SDK image to publish, ASP.NET runtime
  image to run).
- `api/AppDbContext.cs` — minimal `User`/`ApiKey` models + `DbContext`.
- `api/Program.cs` — calls `db.Database.Migrate()` then `DevSeed.EnsureSeeded`
  on startup.
- `api/DevSeed.cs` — idempotent (skips if any user already exists) seed of
  one dev user + API key, printed to stdout so `make logs` shows it.

## Adding migrations

This template ships with **no EF migrations committed** — the schema is
project-specific, so generate your own once `AppDbContext`'s models match
what you need:

```bash
cd api
dotnet ef migrations add InitialCreate
```

`Program.cs` already calls `Database.Migrate()` on startup, so committed
migrations apply automatically the next time the container starts — no
separate migration step in the compose file.

## Copying into a real project

Everything under `api/` and the root `docker-compose.yml`/`Makefile` are
meant to be copied wholesale into a real repo's backend — swap the model
classes in `AppDbContext.cs` and the seed logic in `DevSeed.cs` for the
project's actual domain.
