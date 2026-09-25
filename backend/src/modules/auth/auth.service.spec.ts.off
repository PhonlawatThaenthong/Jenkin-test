import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user.entity';

// bcrypt is a native addon; unit tests never need real hashing.
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));


const user = {
  id: 'u1', name: 'N', email: 'a@b.com', phone: null, role: UserRole.CUSTOMER, passwordHash: 'h',
};

describe('AuthService', () => {
  let users: Record<string, jest.Mock>;
  let jwt: { signAsync: jest.Mock };
  let refreshRepo: Record<string, jest.Mock>;
  let service: AuthService;

  beforeEach(() => {
    users = { create: jest.fn(), findByEmailWithSecret: jest.fn() };
    jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') };
    refreshRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    service = new AuthService(users as never, jwt as never, refreshRepo as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('register creates the user and issues tokens', async () => {
    users.create.mockResolvedValue(user);
    const tokens = await service.register({ name: 'N', email: 'a@b.com', password: 'secret123' });

    expect(tokens.accessToken).toBe('access.jwt');
    expect(tokens.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    expect(tokens.user).toEqual({
      id: 'u1', name: 'N', email: 'a@b.com', phone: null, role: UserRole.CUSTOMER,
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'u1', email: 'a@b.com', role: UserRole.CUSTOMER }, expect.any(Object),
    );
    expect(refreshRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', tokenHash: expect.any(String) }),
    );
  });

  describe('login', () => {
    it('issues tokens for valid credentials', async () => {
      users.findByEmailWithSecret.mockResolvedValue(user);
      jest.spyOn(UsersService, 'verifyPassword').mockResolvedValue(true);
      await expect(service.login({ email: 'a@b.com', password: 'p' })).resolves.toHaveProperty('accessToken');
    });

    it('rejects an unknown email', async () => {
      users.findByEmailWithSecret.mockResolvedValue(null);
      await expect(service.login({ email: 'x@b.com', password: 'p' })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      users.findByEmailWithSecret.mockResolvedValue(user);
      jest.spyOn(UsersService, 'verifyPassword').mockResolvedValue(false);
      await expect(service.login({ email: 'a@b.com', password: 'bad' })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates a valid token', async () => {
      const record = { user, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };
      refreshRepo.findOne.mockResolvedValue(record);
      const tokens = await service.refresh('raw');
      expect(record.revokedAt).toBeInstanceOf(Date);
      expect(tokens.accessToken).toBe('access.jwt');
    });

    it('rejects an unknown token', async () => {
      refreshRepo.findOne.mockResolvedValue(null);
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a revoked token', async () => {
      refreshRepo.findOne.mockResolvedValue({ user, revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      refreshRepo.findOne.mockResolvedValue({ user, revokedAt: null, expiresAt: new Date(Date.now() - 1) });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  it('logout revokes the token', async () => {
    await service.logout('raw');
    expect(refreshRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: expect.any(String) }),
      { revokedAt: expect.any(Date) },
    );
  });
});
