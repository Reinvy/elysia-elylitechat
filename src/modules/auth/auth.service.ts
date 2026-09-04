import jwt from "jsonwebtoken";
// import { jwt } from "@elysiajs/jwt";
import { createHash, randomUUID } from "crypto";
import { prisma } from "../../config/db";

function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export class AuthService {
  private readonly JWT_SECRET: string;
  private readonly JWT_REFRESH_SECRET: string;
  private readonly SALT_ROUNDS = 12;
  private readonly ACCESS_TOKEN_EXPIRES_IN = "15m";
  private readonly REFRESH_TOKEN_EXPIRES_IN = "7d";

  constructor() {
    this.JWT_SECRET =
      process.env.JWT_SECRET ||
      "your_jwt_secret_key_please_change_this_in_production";
    this.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ||
      "your_jwt_refresh_secret_key_please_change_this_in_production";
  }

  async register(userData: any): Promise<any> {
    // Validate input
    if (!userData.email || !userData.password || !userData.username) {
      throw new Error("Email, password, and username are required");
    }

    if (userData.password.length < 8) {
      throw new Error("Password must be at least 8 characters long");
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email },
    });
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    const hashedPassword = await Bun.password.hash(userData.password, {
      algorithm: "bcrypt",
      cost: this.SALT_ROUNDS,
    });

    // Create user (pick only user columns; device fields go to Session)
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        username: userData.username,
        password: hashedPassword,
      },
    });

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    // Track the device session (parallel ElyChat + ElyLiteChat logins coexist).
    await this.upsertSession({
      userId: user.id,
      deviceId: userData.deviceId,
      deviceType: userData.deviceType,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      ipAddress: userData.ipAddress,
      userAgent: userData.userAgent,
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      ...tokens,
    };
  }

  async login(credentials: any): Promise<any> {
    // Validate input
    if (!credentials.email || !credentials.password) {
      throw new Error("Email and password are required");
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
    });
    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error("Account is disabled");
    }

    const isPasswordValid = await Bun.password.verify(
      credentials.password,
      user.password
    );
    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

    // Track the device session.
    await this.upsertSession({
      userId: user.id,
      deviceId: credentials.deviceId,
      deviceType: credentials.deviceType,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      ipAddress: credentials.ipAddress,
      userAgent: credentials.userAgent,
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      ...tokens,
    };
  }

  async refreshToken(
    refreshTokenData: any
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshTokenData.refreshToken) {
      throw new Error("Refresh token is required");
    }

    try {
      const decoded = jwt.verify(
        refreshTokenData.refreshToken,
        this.JWT_REFRESH_SECRET
      ) as any;

      const presentedHash = sha256hex(refreshTokenData.refreshToken);
      const current = await prisma.session.findFirst({
        where: { userId: decoded.userId, refreshTokenHash: presentedHash },
      });

      if (!current) {
        // Valid JWT but unknown hash: already rotated (reuse) or forged.
        // If the user still holds sessions, treat as reuse and wipe the chain.
        const remaining = await prisma.session.count({ where: { userId: decoded.userId } });
        if (remaining > 0) {
          await prisma.session.deleteMany({ where: { userId: decoded.userId } });
          throw new Error("Refresh token reused");
        }
        throw new Error("Session not found");
      }
      if (current.expiresAt <= new Date()) {
        await prisma.session.delete({ where: { id: current.id } });
        throw new Error("Session expired");
      }

      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!user || !user.isActive) {
        throw new Error("User not found or inactive");
      }

      const tokens = this.generateTokens(user.id, user.email);
      await prisma.session.update({
        where: { id: current.id },
        data: {
          accessTokenHash: sha256hex(tokens.accessToken),
          refreshTokenHash: sha256hex(tokens.refreshToken),
          expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
          lastUsedAt: new Date(),
        },
      });
      return tokens;
    } catch (error) {
      if (error instanceof Error && ["Session not found", "Session expired", "Refresh token reused", "User not found or inactive"].includes(error.message)) {
        throw error;
      }
      throw new Error("Invalid refresh token");
    }
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new Error("Refresh token is required");
    }

    try {
      jwt.verify(refreshToken, this.JWT_REFRESH_SECRET);
      await prisma.session.deleteMany({
        where: { refreshTokenHash: sha256hex(refreshToken) },
      });
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  async listSessions(userId: string): Promise<unknown[]> {
    return prisma.session.findMany({
      where: { userId },
      select: {
        deviceId: true,
        deviceType: true,
        ipAddress: true,
        userAgent: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }

  async revokeSession(userId: string, deviceId: string): Promise<boolean> {
    const res = await prisma.session.deleteMany({ where: { userId, deviceId } });
    return res.count > 0;
  }

  private async upsertSession(input: {
    userId: string;
    deviceId?: string;
    deviceType?: string;
    accessToken: string;
    refreshToken: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const deviceId = input.deviceId || randomUUID();
    const existing = await prisma.session.findUnique({
      where: { userId_deviceId: { userId: input.userId, deviceId } },
    });
    const data = {
      deviceType: input.deviceType || "elylite",
      accessTokenHash: sha256hex(input.accessToken),
      refreshTokenHash: sha256hex(input.refreshToken),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
      lastUsedAt: new Date(),
    };
    if (existing) {
      await prisma.session.update({ where: { id: existing.id }, data });
    } else {
      await prisma.session.create({
        data: { userId: input.userId, deviceId, ...data },
      });
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!currentPassword || !newPassword) {
      throw new Error("Current password and new password are required");
    }

    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters long");
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const isCurrentPasswordValid = await Bun.password.verify(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const hashedNewPassword = await Bun.password.hash(newPassword, {
      algorithm: "bcrypt",
      cost: this.SALT_ROUNDS,
    });

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });
  }

  async getUserProfile(userId: string): Promise<Omit<any, "password">> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private generateTokens(
    userId: string,
    email: string
  ): { accessToken: string; refreshToken: string } {
    // jti guarantees every issuance differs (rotation must change the token
    // even within the same second).
    const accessToken = jwt.sign({ userId, email, jti: randomUUID() }, this.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRES_IN,
    });

    const refreshToken = jwt.sign({ userId, email, jti: randomUUID() }, this.JWT_REFRESH_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRES_IN,
    });

    return { accessToken, refreshToken };
  }

  // Utility method to verify access token
  verifyAccessToken(token: string): { userId: string; email: string } {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as any;
      return { userId: decoded.userId, email: decoded.email };
    } catch (error) {
      throw new Error("Invalid access token");
    }
  }
}

export const authService = new AuthService();
