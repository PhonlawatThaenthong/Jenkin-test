import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'blocs/auth/auth_bloc.dart';
import 'blocs/auth/auth_event.dart';
import 'blocs/booking/booking_bloc.dart';
import 'blocs/booking/booking_event.dart';
import 'blocs/restaurant/restaurant_bloc.dart';
import 'blocs/restaurant/restaurant_event.dart';
import 'blocs/room/room_bloc.dart';
import 'blocs/room/room_event.dart';
import 'config.dart';
import 'repositories/repositories.dart';
import 'repositories/mock/mock_repositories.dart';
import 'screens/splash_screen.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const HotelBookingApp());
}

class HotelBookingApp extends StatelessWidget {
  const HotelBookingApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Single wiring point for the data layer. Phase 2 of the backend migration
    // swaps these four lines for the HTTP implementations — no Bloc, screen or
    // widget changes.
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AuthRepository>(create: (_) => MockAuthRepository()),
        RepositoryProvider<RoomRepository>(create: (_) => MockRoomRepository()),
        RepositoryProvider<BookingRepository>(
          create: (_) => MockBookingRepository(),
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
    );
  }
}
