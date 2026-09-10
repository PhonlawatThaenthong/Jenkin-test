import '../models/restaurant.dart';

/// Data access for nearby restaurants. Backend: `GET /api/restaurants`.
abstract class RestaurantRepository {
  Future<List<Restaurant>> fetchRestaurants();
}
