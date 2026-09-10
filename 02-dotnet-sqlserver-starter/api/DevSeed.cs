using System.Security.Cryptography;

namespace Api;

// Runs once at startup in local/dev environments only. Creates a single
// user + API key so a fresh docker-compose up leaves you with something to
// authenticate against immediately, instead of hand-inserting rows before
// the API is usable.
public static class DevSeed
{
    public static void EnsureSeeded(AppDbContext db)
    {
        if (db.Users.Any())
        {
            return;
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "dev@example.com",
            CreatedAtUtc = DateTime.UtcNow,
        };

        var apiKey = new ApiKey
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Key = GenerateApiKey(),
            CreatedAtUtc = DateTime.UtcNow,
        };

        db.Users.Add(user);
        db.ApiKeys.Add(apiKey);
        db.SaveChanges();

        Console.WriteLine("[DevSeed] created dev user + API key:");
        Console.WriteLine($"[DevSeed]   user:    {user.Email} ({user.Id})");
        Console.WriteLine($"[DevSeed]   api key: {apiKey.Key}");
    }

    private static string GenerateApiKey()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes).Replace("+", "").Replace("/", "").Replace("=", "");
    }
}
