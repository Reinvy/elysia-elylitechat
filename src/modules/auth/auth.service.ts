import jwt from "jsonwebtoken";
import { prisma } from "../../config/db";
import { UserPlain } from "../../../generated/prismabox/User";

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

    // Create user
    const user = await prisma.user.create({
      data: {
        ...userData,
        password: hashedPassword,
      },
    });

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.email);

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
      // Verify refresh token
      const decoded = jwt.verify(
        refreshTokenData.refreshToken,
        this.JWT_REFRESH_SECRET
      ) as any;

      // Check if user still exists
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });
      if (!user || !user.isActive) {
        throw new Error("User not found or inactive");
      }

      // Generate new tokens
      return this.generateTokens(user.id, user.email);
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new Error("Refresh token is required");
    }

    try {
      // Verify refresh token and invalidate it
      jwt.verify(refreshToken, this.JWT_REFRESH_SECRET);
      // In a production environment, you would store invalidated tokens in a blacklist
      // For now, we'll just validate the token format
    } catch (error) {
      throw new Error("Invalid refresh token");
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
    const accessToken = jwt.sign({ userId, email }, this.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRES_IN,
    });

    const refreshToken = jwt.sign({ userId, email }, this.JWT_REFRESH_SECRET, {
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
