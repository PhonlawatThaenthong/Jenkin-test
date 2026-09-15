import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { StaffBookingsController } from './staff-bookings.controller';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [TypeOrmModule.forFeature([Booking]), RoomsModule],
  controllers: [BookingsController, StaffBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
