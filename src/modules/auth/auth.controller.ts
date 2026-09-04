import { authService } from "./auth.service";
import { checkRateLimit } from "../../redis.js";

function clientIp(headers: Record<string, string | undefined>): string {
  const fwd = headers["x-forwarded-for"];
  if (fwd) return (fwd.split(",")[0] ?? "unknown").trim();
  return headers["x-real-ip"] ?? "unknown";
}

async function authLimit(ip: string, scope: string): Promise<string | null> {
  try {
    const res = await checkRateLimit(`rl:auth:${scope}:${ip}`, 30, 60);
    if (!res.allowed) return `retry in ${res.resetSec}s`;
    return null;
  } catch {
    return null; // fail-open; rotation/reuse guards still apply
  }
}

export class AuthController {
  // Register business logic
  async register({ body, headers }: { body: any; headers: Record<string, string | undefined> }) {
    try {
      const limited = await authLimit(clientIp(headers), "register");
      if (limited) throw new Error(`Rate limited (${limited})`);
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
  async login({ body, headers, set }: { body: any; headers: Record<string, string | undefined>; set: any }) {
    try {
      const limited = await authLimit(clientIp(headers), "login");
      if (limited) throw new Error(`Rate limited (${limited})`);
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

  // List device sessions for the authenticated user
  async listSessions({ headers }: { headers: Record<string, string | undefined> }) {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      const decoded = authService.verifyAccessToken(authHeader.substring(7));
      const sessions = await authService.listSessions(decoded.userId);
      return { success: true, message: "Sessions retrieved successfully", data: sessions };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to list sessions",
        data: null,
      };
    }
  }

  // Revoke one device session
  async revokeSession({ headers, params }: { headers: Record<string, string | undefined>; params: { deviceId: string } }) {
    try {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Authorization token required");
      }
      const decoded = authService.verifyAccessToken(authHeader.substring(7));
      const revoked = await authService.revokeSession(decoded.userId, params.deviceId);
      return { success: true, message: revoked ? "Session revoked" : "Session not found", data: { revoked } };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to revoke session",
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
