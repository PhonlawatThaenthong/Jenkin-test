import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/restaurant.dart';
import '../../repositories/repository_exception.dart';
import '../../repositories/restaurant_repository.dart';
import 'restaurant_event.dart';
import 'restaurant_state.dart';

class RestaurantBloc extends Bloc<RestaurantEvent, RestaurantState> {
  RestaurantBloc(this._repository) : super(const RestaurantState()) {
    on<RestaurantStarted>(_onStarted);
  }

  final RestaurantRepository _repository;

  /// Restaurants sorted nearest-first.
  List<Restaurant> get nearby {
    final sorted = [...state.restaurants];
    sorted.sort((a, b) => a.distanceKm.compareTo(b.distanceKm));
    return sorted;
  }

  Future<void> _onStarted(
    RestaurantStarted event,
    Emitter<RestaurantState> emit,
  ) async {
    try {
      emit(state.copyWith(restaurants: await _repository.fetchRestaurants()));
    } on RepositoryException catch (e) {
      emit(state.copyWith(errorMessage: e.message));
    }
  }
}
