import '../../models/booking.dart';

class BookingState {
  final List<Booking> bookings;

  /// Set only by the event that just created a booking, so screens can react
  /// to it via BlocListener without a return value. Null on every other
  /// transition.
  final Booking? lastCreatedBooking;

  /// Transient: set on the failing transition only, never carried forward.
  /// A 409 from the backend (room already booked) surfaces here.
  final String? errorMessage;

  const BookingState({
    this.bookings = const [],
    this.lastCreatedBooking,
    this.errorMessage,
  });

  BookingState copyWith({
    List<Booking>? bookings,
    Booking? lastCreatedBooking,
    String? errorMessage,
  }) {
    return BookingState(
      bookings: bookings ?? this.bookings,
      lastCreatedBooking: lastCreatedBooking,
      errorMessage: errorMessage,
    );
  }
}
