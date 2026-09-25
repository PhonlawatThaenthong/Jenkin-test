import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RoomsService } from './rooms.service';
import { RoomStatus, RoomType } from './room.entity';

function makeQb(result: unknown[] = []) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('RoomsService', () => {
  let repo: Record<string, jest.Mock>;
  let service: RoomsService;

  beforeEach(() => {
    repo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'r1', ...x })),
      remove: jest.fn(),
    };
    service = new RoomsService(repo as never);
  });

  describe('search', () => {
    it('lists available rooms without filters', async () => {
      const qb = makeQb([{ id: 'r1' }]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.search({})).resolves.toEqual([{ id: 'r1' }]);
      expect(qb.where).toHaveBeenCalledWith('r.status = :status', { status: RoomStatus.AVAILABLE });
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('applies type, guests and date-range filters', async () => {
      const qb = makeQb();
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.search({
        type: RoomType.DELUXE, guests: 2, checkIn: '2026-10-01', checkOut: '2026-10-03',
      });
      expect(qb.andWhere).toHaveBeenCalledTimes(3);
      expect(qb.andWhere).toHaveBeenLastCalledWith(
        expect.stringContaining('NOT EXISTS'),
        { checkIn: '2026-10-01', checkOut: '2026-10-03' },
      );
    });

    it('rejects a half-open range', async () => {
      await expect(service.search({ checkIn: '2026-10-01' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects checkOut not after checkIn', async () => {
      await expect(
        service.search({ checkIn: '2026-10-03', checkOut: '2026-10-03' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getOrFail', () => {
    it('returns the room', async () => {
      repo.findOne.mockResolvedValue({ id: 'r1' });
      await expect(service.getOrFail('r1')).resolves.toEqual({ id: 'r1' });
    });

    it('throws NotFound when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getOrFail('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('create fills defaults', async () => {
    const room = await service.create({
      name: 'A', type: RoomType.STANDARD, pricePerNight: 1000, capacity: 2,
    } as never);
    expect(room).toMatchObject({
      description: '', imageUrls: [], amenities: [], status: RoomStatus.AVAILABLE,
    });
  });

  it('update merges fields and saves', async () => {
    repo.findOne.mockResolvedValue({ id: 'r1', name: 'Old' });
    const room = await service.update('r1', { name: 'New' } as never);
    expect(room.name).toBe('New');
    expect(repo.save).toHaveBeenCalled();
  });

  describe('remove', () => {
    beforeEach(() => repo.findOne.mockResolvedValue({ id: 'r1' }));

    it('removes the room', async () => {
      await service.remove('r1');
      expect(repo.remove).toHaveBeenCalledWith({ id: 'r1' });
    });

    it('maps FK violation to Conflict', async () => {
      repo.remove.mockRejectedValue(new QueryFailedError('DELETE', [], { code: '23503' } as never));
      await expect(service.remove('r1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows other errors', async () => {
      repo.remove.mockRejectedValue(new Error('boom'));
      await expect(service.remove('r1')).rejects.toThrow('boom');
    });
  });
});
