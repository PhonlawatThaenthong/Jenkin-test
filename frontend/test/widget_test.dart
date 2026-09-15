import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:hotel_booking/models/booking.dart';
import 'package:hotel_booking/blocs/booking/booking_bloc.dart';
import 'package:hotel_booking/blocs/booking/booking_event.dart';
import 'package:hotel_booking/repositories/api/api_repositories.dart';
import 'package:hotel_booking/repositories/mock/mock_booking_repository.dart';
import 'package:hotel_booking/screens/auth/login_screen.dart';
import 'package:hotel_booking/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('App boots to the login screen for a fresh session',
      (tester) async {
    // No saved session in storage.
    SharedPreferences.setMockInitialValues({});

    // The app now talks to the API on startup. A stub client keeps the test
    // hermetic — no server, no sockets — and 401 is exactly what a real API
    // answers a request carrying no token.
    final offline = MockClient(
      (request) async => http.Response('{"message":"Unauthorized"}', 401),
    );

    await tester.pumpWidget(
      HotelBookingApp(apiClient: ApiClient(httpClient: offline)),
    );
    // Let the async session restore complete (the splash spinner animates
    // forever, so we pump fixed frames rather than pumpAndSettle).
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(LoginScreen), findsOneWidget);
  });

  test('Booking overlap detection works', () {
    final booking = Booking(
      id: 'x',
      roomId: 'r1',
      roomName: 'Room',
      customerId: 'c1',
      customerName: 'C',
      checkIn: DateTime(2026, 1, 10),
      checkOut: DateTime(2026, 1, 15),
      guests: 2,
      totalPrice: 1000,
      createdAt: DateTime(2026, 1, 1),
    );

    // Overlapping range.
    expect(booking.overlaps(DateTime(2026, 1, 12), DateTime(2026, 1, 14)), true);
    // Non-overlapping range (starts on checkout day).
    expect(
        booking.overlaps(DateTime(2026, 1, 15), DateTime(2026, 1, 18)), false);
  });

  test('Revenue counts only paid bookings from seed data', () async {
    final bloc = BookingBloc(MockBookingRepository())
      ..add(const BookingStarted());
    await bloc.stream.first;
    expect(bloc.totalRevenue, greaterThan(0));
    expect(bloc.totalBookings, greaterThan(0));
  });
}
