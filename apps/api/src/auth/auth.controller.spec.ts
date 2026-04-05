import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  it("does not expose the access token in the login response body", async () => {
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
    expect(result).toEqual({
      user: { id: "user-1", username: "admin", role: "ADMIN" },
    });
    expect(result).not.toHaveProperty("accessToken");
  });
});
