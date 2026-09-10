using Api;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

var app = builder.Build();

// Applies whatever migrations exist under EF's migration history on
// container start, then seeds dev data. Run `dotnet ef migrations add
// InitialCreate` once you've shaped AppDbContext's models the way you want —
// this template intentionally ships with no migrations committed yet, since
// the schema is project-specific.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    DevSeed.EnsureSeeded(db);
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/users", async (AppDbContext db) =>
    Results.Ok(await db.Users.Select(u => new { u.Id, u.Email, u.CreatedAtUtc }).ToListAsync()));

app.Run();
