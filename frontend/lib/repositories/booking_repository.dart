import '../models/booking.dart';

/// Data access for bookings. Backend: `/api/bookings` and
/// `/api/staff/bookings`.
abstract class BookingRepository {
  /// Backend: `GET /api/bookings/me` for customers,
  /// `GET /api/staff/bookings` for staff.
  Future<List<Booking>> fetchBookings();

  /// Backend: `POST /api/bookings` followed by `POST /api/bookings/:id/pay`.
  ///
  /// The server rejects an overlapping range with 409 in Sprint 2; the
  /// implementation surfaces that as a [RepositoryException].
  Future<Booking> createAndPay({
    required String roomId,
    required String roomName,
    required String customerId,
    required String customerName,
    required DateTime checkIn,
    required DateTime checkOut,
    required int guests,
    required double totalPrice,
  });

  /// Backend: `PATCH /api/staff/bookings/:id` — status transition.
  Future<Booking> updateStatus(String id, BookingStatus status);

  /// Backend: `PATCH /api/staff/bookings/:id` — new date range.
  /// The total price is recalculated from the stored nightly rate.
  Future<Booking> reschedule(String id, DateTime checkIn, DateTime checkOut);
}
