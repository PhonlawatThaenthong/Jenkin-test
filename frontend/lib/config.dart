/// App-wide configuration. In a real deployment most of these would come from
/// environment variables or a remote config service.
class AppConfig {
  AppConfig._();

  static const String hotelName = 'Poonsuk Resort';

  /// Base URL of the NestJS API.
  ///
  /// Default assumes the API is reachable on the same host as the app
  /// (desktop/web build, or the API port forwarded out of the VM). Override
  /// without touching this file:
  ///
  ///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:3000
  ///
  /// Android emulator cannot see the host on `localhost` — it needs
  /// `http://10.0.2.2:3000`; a physical device needs the host's LAN IP.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// Hotel coordinates (sample location: Pattaya Beach, Thailand). Used to
  /// centre maps and compute "directions to the hotel" links.
  static const double hotelLat = 12.9276;
  static const double hotelLng = 100.8770;
  static const String hotelAddress =
      'Beach Road, Pattaya, Chonburi 20150, Thailand';
}
