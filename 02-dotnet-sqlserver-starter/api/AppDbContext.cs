using Microsoft.EntityFrameworkCore;

namespace Api;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; }
}

public class ApiKey
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Key { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; }
}

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
}
