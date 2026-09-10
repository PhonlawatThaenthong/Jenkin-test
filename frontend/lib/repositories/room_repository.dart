import '../models/room.dart';

/// Data access for rooms. Backend: `/api/rooms` and `/api/staff/rooms`.
abstract class RoomRepository {
  /// Backend: `GET /api/rooms`.
  Future<List<Room>> fetchRooms();

  /// Backend: `POST /api/staff/rooms`.
  Future<Room> createRoom({
    required String name,
    required RoomType type,
    required double pricePerNight,
    required int capacity,
    required String description,
    required List<String> imageUrls,
    required List<String> amenities,
  });

  /// Backend: `PATCH /api/staff/rooms/:id` — full replacement.
  Future<Room> updateRoom(Room room);

  /// Backend: `PATCH /api/staff/rooms/:id` — price only.
  Future<Room> updatePrice(String id, double pricePerNight);

  /// Backend: `PATCH /api/staff/rooms/:id` — availability/maintenance.
  Future<Room> updateStatus(String id, RoomStatus status);

  /// Backend: `DELETE /api/staff/rooms/:id`.
  Future<void> deleteRoom(String id);
}
