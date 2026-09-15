import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'blocs/auth/auth_bloc.dart';
import 'blocs/auth/auth_event.dart';
import 'blocs/auth/auth_state.dart';
import 'blocs/booking/booking_bloc.dart';
import 'blocs/booking/booking_event.dart';
import 'blocs/restaurant/restaurant_bloc.dart';
import 'blocs/restaurant/restaurant_event.dart';
import 'blocs/room/room_bloc.dart';
import 'blocs/room/room_event.dart';
import 'config.dart';
import 'repositories/repositories.dart';
import 'repositories/api/api_repositories.dart';
import 'repositories/mock/mock_repositories.dart';
import 'screens/splash_screen.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // One client for the whole app: it holds the access/refresh token pair and
  // de-duplicates token rotation across repositories.
  runApp(HotelBookingApp(apiClient: ApiClient()));
}

class HotelBookingApp extends StatelessWidget {
  const HotelBookingApp({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  Widget build(BuildContext context) {
    // Single wiring point for the data layer. Auth, rooms and bookings now talk
    // to the NestJS API; restaurants stay on mock data until `/api/restaurants`
    // exists.
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AuthRepository>(
          create: (_) => ApiAuthRepository(apiClient),
        ),
        RepositoryProvider<RoomRepository>(
          create: (_) => ApiRoomRepository(apiClient),
        ),
        RepositoryProvider<BookingRepository>(
          create: (_) => ApiBookingRepository(apiClient),
        ),
        RepositoryProvider<RestaurantRepository>(
          create: (_) => MockRestaurantRepository(),
        ),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider(
            create: (ctx) =>
                AuthBloc(ctx.read<AuthRepository>())..add(const AuthStarted()),
          ),
          BlocProvider(
            create: (ctx) =>
                RoomBloc(ctx.read<RoomRepository>())..add(const RoomStarted()),
          ),
          BlocProvider(
            create: (ctx) => BookingBloc(ctx.read<BookingRepository>())
              ..add(const BookingStarted()),
          ),
          BlocProvider(
            create: (ctx) => RestaurantBloc(ctx.read<RestaurantRepository>())
              ..add(const RestaurantStarted()),
          ),
        ],
        // Rooms and bookings are fetched once at startup, before anyone has
        // signed in — so the customer sees the public catalogue and no
        // bookings. The moment authentication settles (restored session, login
        // or logout) both are re-fetched, because who is asking decides which
        // endpoint answers: /api/rooms vs /api/staff/rooms, /api/bookings/me
        // vs /api/staff/bookings.
        child: BlocListener<AuthBloc, AuthState>(
          listenWhen: (previous, current) => previous.status != current.status,
          listener: (ctx, state) {
            if (state.status == AuthStatus.authenticated ||
                state.status == AuthStatus.unauthenticated) {
              ctx.read<RoomBloc>().add(const RoomStarted());
              ctx.read<BookingBloc>().add(const BookingStarted());
            }
          },
          child: MaterialApp(
            title: AppConfig.hotelName,
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light,
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en', 'GB')],
            locale: const Locale('en', 'GB'),
            home: const SplashScreen(),
          ),
        ),
      ),
    );
  }
}
