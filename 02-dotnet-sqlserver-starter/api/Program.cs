using Api;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

var app = builder.Build();

// Applies whatever migrations exist under EF's migration history on
// container start, then seeds dev data. Ships with one InitialCreate
// migration matching the User/ApiKey models below — once you change the
// schema for a real project, run `dotnet ef migrations add <Name>` to add
// the next one; Migrate() picks up anything unapplied automatically.
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
