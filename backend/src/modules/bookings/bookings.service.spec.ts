import {
  BadRequestException, ConflictException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { BookingsService } from './bookings.service';
import { BookingStatus, PaymentStatus } from './booking.entity';
import { RoomStatus } from '../rooms/room.entity';
import { UserRole } from '../users/user.entity';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'b1', roomId: 'r1', customerId: 'c1', checkIn: '2026-10-01', checkOut: '2026-10-03',
  guests: 2, totalPrice: 3000, status: BookingStatus.PENDING, paymentStatus: PaymentStatus.UNPAID,
  createdAt: new Date(), room: { name: 'Deluxe', pricePerNight: 1500 }, customer: { name: 'C' },
  ...over,
});

describe('BookingsService', () => {
  let repo: Record<string, jest.Mock>;
  let roomRepo: { findOne: jest.Mock };
  let txBookingRepo: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };
  let service: BookingsService;

  beforeEach(() => {
    repo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(async (x) => x) };
    roomRepo = { findOne: jest.fn() };
    txBookingRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'b1', ...x })),
      findOne: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: { name: string }) =>
        entity.name === 'Room' ? roomRepo : txBookingRepo),
    };
    dataSource = { transaction: jest.fn(async (_iso: string, fn: (m: unknown) => unknown) => fn(manager)) };
    service = new BookingsService(repo as never, dataSource as never);
  });

  describe('create', () => {
    const dto = { roomId: 'r1', checkIn: '2026-10-01', checkOut: '2026-10-03', guests: 2 };

    it('prices from the stored nightly rate and returns the booking', async () => {
      roomRepo.findOne.mockResolvedValue({ id: 'r1', status: RoomStatus.AVAILABLE, capacity: 2, pricePerNight: 1500 });
      repo.findOne.mockResolvedValue(row());

      const res = await service.create('c1', dto);
      expect(txBookingRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        totalPrice: 3000, status: BookingStatus.PENDING, paymentStatus: PaymentStatus.UNPAID,
      }));
      expect(dataSource.transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.any(Function));
      expect(res).toMatchObject({ id: 'b1', roomName: 'Deluxe', nights: 2 });
    });

    it('rejects checkOut not after checkIn', async () => {
      await expect(service.create('c1', { ...dto, checkOut: '2026-10-01' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 when the room does not exist', async () => {
      roomRepo.findOne.mockResolvedValue(null);
      await expect(service.create('c1', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 when the room is under maintenance', async () => {
      roomRepo.findOne.mockResolvedValue({ id: 'r1', status: RoomStatus.MAINTENANCE, capacity: 2 });
      await expect(service.create('c1', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('400 when guests exceed capacity', async () => {
      roomRepo.findOne.mockResolvedValue({ id: 'r1', status: RoomStatus.AVAILABLE, capacity: 1 });
      await expect(service.create('c1', dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['23P01', '40001'])('maps SQLSTATE %s to 409', async (code) => {
      dataSource.transaction.mockRejectedValue(new QueryFailedError('INSERT', [], { code } as never));
      await expect(service.create('c1', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('passes through unrelated DB errors', async () => {
      const err = new QueryFailedError('INSERT', [], { code: '99999' } as never);
      dataSource.transaction.mockRejectedValue(err);
      await expect(service.create('c1', dto)).rejects.toBe(err);
    });
  });

  it('findForCustomer maps rows', async () => {
    repo.find.mockResolvedValue([row()]);
    const res = await service.findForCustomer('c1');
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 'c1' } }));
    expect(res[0].customerName).toBe('C');
  });

  it('findAll maps rows', async () => {
    repo.find.mockResolvedValue([row(), row({ id: 'b2' })]);
    await expect(service.findAll()).resolves.toHaveLength(2);
  });

  it('getOrFail throws when missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.getOrFail('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('markPaid', () => {
    it('marks paid and approved', async () => {
      const b = row();
      repo.findOne.mockResolvedValue(b);
      await service.markPaid('b1', 'c1', UserRole.CUSTOMER);
      expect(b.paymentStatus).toBe(PaymentStatus.PAID);
      expect(b.status).toBe(BookingStatus.APPROVED);
      expect(repo.save).toHaveBeenCalledWith(b);
    });

    it('is idempotent when already paid', async () => {
      repo.findOne.mockResolvedValue(row({ paymentStatus: PaymentStatus.PAID }));
      await service.markPaid('b1', 'c1', UserRole.CUSTOMER);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('404 when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.markPaid('x', 'c1', UserRole.CUSTOMER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("403 for another customer's booking", async () => {
      repo.findOne.mockResolvedValue(row());
      await expect(service.markPaid('b1', 'c2', UserRole.CUSTOMER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('409 when cancelled', async () => {
      repo.findOne.mockResolvedValue(row({ status: BookingStatus.CANCELLED }));
      await expect(service.markPaid('b1', 'staff', UserRole.STAFF)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('requires at least one field', async () => {
      await expect(service.update('b1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires both dates together', async () => {
      await expect(service.update('b1', { checkIn: '2026-10-01' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reschedules and re-prices', async () => {
      const b = row();
      txBookingRepo.findOne.mockResolvedValue(b);
      repo.findOne.mockResolvedValue(b);
      await service.update('b1', { checkIn: '2026-10-05', checkOut: '2026-10-08' });
      expect(b.totalPrice).toBe(4500);
      expect(txBookingRepo.save).toHaveBeenCalledWith(b);
    });

    it('changes status only', async () => {
      const b = row();
      txBookingRepo.findOne.mockResolvedValue(b);
      repo.findOne.mockResolvedValue(b);
      await service.update('b1', { status: BookingStatus.APPROVED });
      expect(b.status).toBe(BookingStatus.APPROVED);
    });

    it('404 when missing', async () => {
      txBookingRepo.findOne.mockResolvedValue(null);
      await expect(service.update('x', { status: BookingStatus.APPROVED })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancel', () => {
    it('cancels and refunds a paid booking', async () => {
      const b = row({ paymentStatus: PaymentStatus.PAID });
      repo.findOne.mockResolvedValue(b);
      await service.cancel('b1', 'c1', UserRole.CUSTOMER);
      expect(b.status).toBe(BookingStatus.CANCELLED);
      expect(b.paymentStatus).toBe(PaymentStatus.REFUNDED);
    });

    it('cancels an unpaid booking without refund', async () => {
      const b = row();
      repo.findOne.mockResolvedValue(b);
      await service.cancel('b1', 'admin', UserRole.ADMIN);
      expect(b.paymentStatus).toBe(PaymentStatus.UNPAID);
    });

    it('404 when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.cancel('x', 'c1', UserRole.CUSTOMER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("403 for another customer's booking", async () => {
      repo.findOne.mockResolvedValue(row());
      await expect(service.cancel('b1', 'c2', UserRole.CUSTOMER)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
