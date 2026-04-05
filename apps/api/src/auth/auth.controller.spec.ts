import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not expose the access token in the login response body", async () => {
    process.env.CORS_ORIGIN = "https://staging-app.hmpunch.com";
    const login = jest.fn().mockResolvedValue({
      accessToken: "jwt-token",
      user: { id: "user-1", username: "admin", role: "ADMIN" },
    });
    const cookie = jest.fn();
    const response = { cookie } as any;
    const controller = new AuthController({ login } as any);

    const result = await controller.login(
      { username: "admin", password: "secret" },
      response,
    );

    expect(login).toHaveBeenCalledWith({ username: "admin", password: "secret" });
    expect(cookie).toHaveBeenCalledTimes(2);
    expect(cookie).toHaveBeenNthCalledWith(
      1,
      "access_token",
      "jwt-token",
      expect.objectContaining({ domain: ".hmpunch.com" }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      2,
      "csrf_token",
      expect.any(String),
      expect.objectContaining({ domain: ".hmpunch.com" }),
    );
    expect(result).toEqual({
      user: { id: "user-1", username: "admin", role: "ADMIN" },
    });
    expect(result).not.toHaveProperty("accessToken");
  });

  it("does not force a cookie domain for localhost development", async () => {
    process.env.CORS_ORIGIN = "http://localhost:3000";
    const login = jest.fn().mockResolvedValue({
      accessToken: "jwt-token",
      user: { id: "user-1", username: "admin", role: "ADMIN" },
    });
    const cookie = jest.fn();
    const response = { cookie } as any;
    const controller = new AuthController({ login } as any);

    await controller.login({ username: "admin", password: "secret" }, response);

    expect(cookie).toHaveBeenNthCalledWith(
      1,
      "access_token",
      "jwt-token",
      expect.not.objectContaining({ domain: expect.anything() }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      2,
      "csrf_token",
      expect.any(String),
      expect.not.objectContaining({ domain: expect.anything() }),
    );
  });
});
