import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  email: string;
  password: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface CreateUserDto {
  email: string;
  password: string;
  username: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

// In-memory database for production demonstration
// In a real application, replace this with a proper database
class UserDatabase {
  private users: Map<string, User> = new Map();

  async create(userData: CreateUserDto): Promise<User> {
    const existingUser = await this.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const user: User = {
      id: uuidv4(),
      email: userData.email,
      password: userData.password, // Will be hashed before storing
      username: userData.username,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };

    this.users.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async delete(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async findAll(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}

export const userDatabase = new UserDatabase();