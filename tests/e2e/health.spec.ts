import { test, expect } from "@playwright/test";

test.describe("Health Checks", () => {
  test("health endpoint should return OK", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    
    const health = await response.json();
    expect(health).toHaveProperty("status");
    expect(health).toHaveProperty("services");
    expect(health).toHaveProperty("timestamp");
  });

  test("health endpoint should include database status", async ({ request }) => {
    const response = await request.get("/api/health");
    const health = await response.json();
    
    expect(health.services).toHaveProperty("database");
    expect(["up", "down", "degraded"]).toContain(health.services.database.status);
  });

  test("health endpoint should include redis status", async ({ request }) => {
    const response = await request.get("/api/health");
    const health = await response.json();
    
    expect(health.services).toHaveProperty("redis");
    expect(["up", "down", "degraded"]).toContain(health.services.redis.status);
  });

  test("health endpoint should include s3 status", async ({ request }) => {
    const response = await request.get("/api/health");
    const health = await response.json();
    
    expect(health.services).toHaveProperty("s3");
    expect(["up", "down", "degraded"]).toContain(health.services.s3.status);
  });

  test("health endpoint HEAD request should work", async ({ request }) => {
    const response = await request.head("/api/health");
    // Should return 200 if healthy, 503 if unhealthy
    expect([200, 503]).toContain(response.status());
  });
});

test.describe("API Endpoints", () => {
  test("auth/me should require authentication", async ({ request }) => {
    // Without auth, should redirect or return 401
    const response = await request.get("/api/auth/me");
    expect([401, 302, 307]).toContain(response.status());
  });

  test("conversations endpoint should require authentication", async ({ request }) => {
    const response = await request.get("/api/conversations");
    expect([401, 302, 307]).toContain(response.status());
  });
});
