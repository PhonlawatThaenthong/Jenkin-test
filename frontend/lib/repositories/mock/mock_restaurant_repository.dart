import '../../data/mock_data.dart';
import '../../models/restaurant.dart';
import '../restaurant_repository.dart';

class MockRestaurantRepository implements RestaurantRepository {
  @override
  Future<List<Restaurant>> fetchRestaurants() async => MockData.restaurants();
}
