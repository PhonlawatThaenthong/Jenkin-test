import '../../models/restaurant.dart';

class RestaurantState {
  final List<Restaurant> restaurants;

  /// Transient: set on the failing transition only, never carried forward.
  final String? errorMessage;

  const RestaurantState({this.restaurants = const [], this.errorMessage});

  RestaurantState copyWith({
    List<Restaurant>? restaurants,
    String? errorMessage,
  }) {
    return RestaurantState(
      restaurants: restaurants ?? this.restaurants,
      errorMessage: errorMessage,
    );
  }
}
