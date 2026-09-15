import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Booking, BookingStatus, PaymentStatus } from './booking.entity';
import { Room, RoomStatus } from '../rooms/room.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingResponse, nightsBetween, toBookingResponse } from './booking.response';
import { UserRole } from '../users/user.entity';

/** Postgres SQLSTATEs that both mean "someone else got this range first". */
const PG_EXCLUSION_VIOLATION = '23P01';
const PG_SERIALIZATION_FAILURE = '40001';

const RELATIONS = { room: true, customer: true } as const;

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly repo: Repository<Booking>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * `POST /api/bookings`.
   *
   * SERIALIZABLE is the belt; `EXC_bookings_no_overlap` is the braces. The
   * constraint alone already makes a double booking physically impossible —
   * the isolation level is what keeps the read of the room row (price,
   * capacity, status) consistent with the write that depends on it.
   *
   * Both failure codes map to 409, because from the client's point of view
   * they are the same event: the range was taken. No retry loop here — a retry
   * would silently book a range the customer saw as free a moment ago, so the
   * app re-queries and lets the customer choose.
   */
  async create(customerId: string, dto: CreateBookingDto): Promise<BookingResponse> {
    this.assertRange(dto.checkIn, dto.checkOut);

    try {
      const id = await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        const room = await manager.getRepository(Room).findOne({ where: { id: dto.roomId } });
        if (!room) throw new NotFoundException('ไม่พบห้องพัก');
        if (room.status !== RoomStatus.AVAILABLE) {
          throw new ConflictException('ห้องนี้ปิดปรับปรุงอยู่');
        }
        if (dto.guests > room.capacity) {
          throw new BadRequestException(`ห้องนี้รองรับได้สูงสุด ${room.capacity} คน`);
        }

        const nights = nightsBetween(dto.checkIn, dto.checkOut);
        const booking = manager.getRepository(Booking).create({
          roomId: room.id,
          customerId,
          checkIn: dto.checkIn,
          checkOut: dto.checkOut,
          guests: dto.guests,
          // Priced from the row just read inside this transaction, never from
          // anything the client sent.
          totalPrice: Number((room.pricePerNight * nights).toFixed(2)),
          status: BookingStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
        });

        const saved = await manager.getRepository(Booking).save(booking);
        return saved.id;
      });

      return this.getOrFail(id);
    } catch (err) {
      throw this.translateConflict(err);
    }
  }

  /** `GET /api/bookings/me` */
  async findForCustomer(customerId: string): Promise<BookingResponse[]> {
    const rows = await this.repo.find({
      where: { customerId },
      relations: RELATIONS,
      order: { checkIn: 'DESC' },
    });
    return rows.map(toBookingResponse);
  }

  /** `GET /api/staff/bookings` */
  async findAll(): Promise<BookingResponse[]> {
    const rows = await this.repo.find({ relations: RELATIONS, order: { checkIn: 'DESC' } });
    return rows.map(toBookingResponse);
  }

  async getOrFail(id: string): Promise<BookingResponse> {
    const booking = await this.repo.findOne({ where: { id }, relations: RELATIONS });
    if (!booking) throw new NotFoundException('ไม่พบการจอง');
    return toBookingResponse(booking);
  }

  /** `POST /api/bookings/:id/pay` — a stub until the Sprint 4 gateway. */
  async markPaid(id: string, actorId: string, actorRole: UserRole): Promise<BookingResponse> {
    const booking = await this.repo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('ไม่พบการจอง');
    if (actorRole === UserRole.CUSTOMER && booking.customerId !== actorId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงการจองนี้');
    }
    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException('การจองนี้ถูกยกเลิกแล้ว');
    }
    if (booking.paymentStatus === PaymentStatus.PAID) return this.getOrFail(id);

    booking.paymentStatus = PaymentStatus.PAID;
    booking.status = BookingStatus.APPROVED;
    await this.repo.save(booking);
    return this.getOrFail(id);
  }

  /** `PATCH /api/staff/bookings/:id` — status transition and/or reschedule. */
  async update(id: string, dto: UpdateBookingDto): Promise<BookingResponse> {
    if (dto.status === undefined && dto.checkIn === undefined && dto.checkOut === undefined) {
      throw new BadRequestException('ไม่มีข้อมูลที่จะแก้ไข');
    }
    if ((dto.checkIn === undefined) !== (dto.checkOut === undefined)) {
      throw new BadRequestException('การเลื่อนวันต้องระบุทั้ง checkIn และ checkOut');
    }

    try {
      await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
        const bookings = manager.getRepository(Booking);
        const booking = await bookings.findOne({ where: { id }, relations: { room: true } });
        if (!booking) throw new NotFoundException('ไม่พบการจอง');

        if (dto.checkIn && dto.checkOut) {
          this.assertRange(dto.checkIn, dto.checkOut);
          booking.checkIn = dto.checkIn;
          booking.checkOut = dto.checkOut;
          // Re-priced from the stored nightly rate, as the repository contract
          // in booking_repository.dart states.
          booking.totalPrice = Number(
            (booking.room.pricePerNight * nightsBetween(dto.checkIn, dto.checkOut)).toFixed(2),
          );
        }
        if (dto.status) booking.status = dto.status;

        await bookings.save(booking);
      });
    } catch (err) {
      throw this.translateConflict(err);
    }

    return this.getOrFail(id);
  }

  /** A customer cancelling their own booking. */
  async cancel(id: string, actorId: string, actorRole: UserRole): Promise<BookingResponse> {
    const booking = await this.repo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('ไม่พบการจอง');
    if (actorRole === UserRole.CUSTOMER && booking.customerId !== actorId) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงการจองนี้');
    }

    booking.status = BookingStatus.CANCELLED;
    if (booking.paymentStatus === PaymentStatus.PAID) {
      booking.paymentStatus = PaymentStatus.REFUNDED;
    }
    await this.repo.save(booking);
    return this.getOrFail(id);
  }

  private assertRange(checkIn: string, checkOut: string): void {
    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut ต้องมาหลัง checkIn');
    }
  }

  /**
   * Turns the two "you lost the race" SQLSTATEs into a 409 the Flutter
   * `RepositoryException(statusCode: 409)` already knows how to display.
   */
  private translateConflict(err: unknown): unknown {
    if (err instanceof QueryFailedError) {
      const code = (err.driverError as { code?: string }).code;
      if (code === PG_EXCLUSION_VIOLATION || code === PG_SERIALIZATION_FAILURE) {
        return new ConflictException('ห้องนี้ถูกจองในช่วงวันที่เลือกแล้ว');
      }
    }
    return err;
  }
}
