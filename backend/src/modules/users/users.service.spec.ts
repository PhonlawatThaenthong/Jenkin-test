import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserRole } from './user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async () => 'hashed'),
  compare: jest.fn(async (plain: string) => plain === 'right'),
}));

describe('UsersService', () => {
  let repo: Record<string, jest.Mock>;
  let service: UsersService;

  beforeEach(() => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'u1', ...x })),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    service = new UsersService(repo as never);
  });

  it('list orders by role then name', async () => {
    repo.find.mockResolvedValue([]);
    await service.list();
    expect(repo.find).toHaveBeenCalledWith({ order: { role: 'ASC', name: 'ASC' } });
  });

  it('findByEmailWithSecret selects the hash', async () => {
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'u1' }),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    await expect(service.findByEmailWithSecret('A@B.com')).resolves.toEqual({ id: 'u1' });
    expect(qb.addSelect).toHaveBeenCalledWith('u.passwordHash');
  });

  describe('create', () => {
    it('hashes password, lowercases email, defaults role to customer', async () => {
      repo.findOne.mockResolvedValue(null);
      const user = await service.create({ name: 'N', email: 'A@B.COM', password: 'secret123' });
      expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 12);
      expect(user).toMatchObject({
        email: 'a@b.com', phone: null, passwordHash: 'hashed', role: UserRole.CUSTOMER,
      });
    });

    it('rejects a duplicate email', async () => {
      repo.findOne.mockResolvedValue({ id: 'u0' });
      await expect(
        service.create({ name: 'N', email: 'a@b.com', password: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('getOrFail', () => {
    it('returns the user', async () => {
      repo.findOne.mockResolvedValue({ id: 'u1' });
      await expect(service.getOrFail('u1')).resolves.toEqual({ id: 'u1' });
    });

    it('throws NotFound when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getOrFail('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('refuses to delete own account', async () => {
      await expect(service.remove('u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('removes another user', async () => {
      repo.findOne.mockResolvedValue({ id: 'u2' });
      await service.remove('u2', 'u1');
      expect(repo.remove).toHaveBeenCalledWith({ id: 'u2' });
    });

    it('maps FK violation to Conflict', async () => {
      repo.findOne.mockResolvedValue({ id: 'u2' });
      repo.remove.mockRejectedValue(new QueryFailedError('DELETE', [], { code: '23503' } as never));
      await expect(service.remove('u2', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows other errors', async () => {
      repo.findOne.mockResolvedValue({ id: 'u2' });
      repo.remove.mockRejectedValue(new Error('boom'));
      await expect(service.remove('u2', 'u1')).rejects.toThrow('boom');
    });
  });

  it('verifyPassword delegates to bcrypt.compare', async () => {
    await expect(UsersService.verifyPassword('right', 'h')).resolves.toBe(true);
    await expect(UsersService.verifyPassword('wrong', 'h')).resolves.toBe(false);
  });
});
