import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; phone: string | null; role: string };
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const user = await this.users.create(dto);
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.users.findByEmailWithSecret(dto.email);
    // Same message for unknown email and wrong password (no account enumeration).
    if (!user || !(await UsersService.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    return this.issueTokens(user);
  }

  async refresh(rawToken: string): Promise<AuthTokens> {
    const record = await this.refreshRepo.findOne({
      where: { tokenHash: sha256(rawToken) },
      relations: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token ไม่ถูกต้องหรือหมดอายุ');
    }
    // Rotation: the used token is revoked and a fresh pair is issued.
    record.revokedAt = new Date();
    await this.refreshRepo.save(record);
    return this.issueTokens(record.user);
  }

  async logout(rawToken: string): Promise<void> {
    await this.refreshRepo.update(
      { tokenHash: sha256(rawToken), revokedAt: undefined },
      { revokedAt: new Date() },
    );
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const days = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);
    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      }),
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id, name: user.name, email: user.email,
        phone: user.phone, role: user.role,
      },
    };
  }
}
