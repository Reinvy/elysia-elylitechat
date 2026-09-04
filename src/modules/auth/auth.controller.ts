import { authService } from "./auth.service";

export class AuthController {
  // Register business logic
  async register({ body }: { body: any }) {
    try {
      const result = await authService.register(body);
      return {
        success: true,
        message: "User registered successfully",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Registration failed",
        data: null,
      };
    }
  }

  // Login business logic
  async login({ body, set }: { body: any; set: any }) {
    try {
      const result = await authService.login(body);
      set.status = 200;
      return {
        success: true,
        message: "Login successful",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Login failed",
        data: null,
      };
    }
  }

  // Refresh token business logic
  async refreshToken({ body }: { body: any }) {
    try {
      const result = await authService.refreshToken(body);
      return {
        success: true,
        message: "Token refreshed successfully",
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Token refresh failed",
        data: null,
      };
    }
  }

  // Logout business logic
  async logout({ body }: { body: { refreshToken: string } }) {
    try {
      await authService.logout(body.refreshToken);
      return {
        success: true,
        message: "Logout successful",
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Logout failed",
        data: null,
      };
    }
  }

  // Change password business logic
  async changePassword({
    headers,
    body,
  }: {
    headers: Record<string, string | undefined>;
    body: { currentPassword: string; newPassword: string };
  }) {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      const token = authHeader.substring(7);
      const decoded = authService.verifyAccessToken(token);

      await authService.changePassword(
        decoded.userId,
        body.currentPassword,
        body.newPassword
      );

      return {
        success: true,
        message: "Password changed successfully",
        data: null,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Password change failed",
        data: null,
      };
    }
  }

  // Get user profile business logic
  async getProfile(ctx: any) {
    try {
      const authHeader = ctx.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      const token = authHeader.substring(7);
      const decoded = authService.verifyAccessToken(token);
      const user = await authService.getUserProfile(decoded.userId);

      return {
        success: true,
        message: "Profile retrieved successfully",
        data: user,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to retrieve profile",
        data: null,
      };
    }
  }

  // Health check business logic
  health() {
    return {
      success: true,
      message: "Auth service is running",
      data: {
        timestamp: new Date().toISOString(),
        service: process.env.SERVICE_NAME || "auth service",
        uptime_sec: Math.round(process.uptime()),
        pid: process.pid,
      },
    };
  }
}

export const authController = new AuthController();
