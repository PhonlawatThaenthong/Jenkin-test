# Database Schema — Poonsuk Resort Backend

เอกสารนี้เขียนเพื่อให้ AI หรือนักพัฒนาคนถัดไปทำงานต่อได้ทันทีโดยไม่ต้องอ่าน conversation ย้อนหลัง

- **ปลายทางไฟล์:** `E:\mobile-app-final-project\docs\database-schema.md`
- **อ้างอิง:** `docs/Backend_Design_Poonsuk_Resort.docx` หัวข้อ 4 (Database), 9 (REST API), 10 (Security)
- **Stack:** PostgreSQL 16 + TypeORM 0.3 (NestJS 10), `synchronize: false` ถาวร ทุกการเปลี่ยน schema ต้องผ่าน migration
- **อัปเดตล่าสุด:** 2026-09-15

---

## 0. สถานะปัจจุบัน (อ่านก่อนเริ่ม)

| ตาราง | Sprint | สถานะ |
|---|---|---|
| `users` | 1 | migration `1757400000000-InitAuth` รันผ่านแล้ว |
| `refresh_tokens` | 1 | migration `1757400000000-InitAuth` รันผ่านแล้ว |
| `rooms` | 2 | ยังไม่สร้าง |
| `bookings` | 2 | ยังไม่สร้าง |
| `payments` | 4 | ยังไม่สร้าง |
| `notifications_log` | 4 | ยังไม่สร้าง |
| `restaurants` | 4 | ยังไม่สร้าง |

Extension `pgcrypto` และ `btree_gist` ถูกเปิดไว้แล้วใน migration ของ Sprint 1 — ไม่ต้องเปิดซ้ำ

**ก่อนเขียน migration ใหม่ ให้ตรวจสถานะจริงเสมอ:**

```powershell
cd E:\mobile-app-final-project\backend
npm run typeorm -- migration:show
```

---

## 1. ER Diagram

```
users ──1:N──> bookings <──N:1── rooms
  │               │
  │               ├──1:1──> payments
  │               └──1:N──> notifications_log
  │
  └──1:N──> refresh_tokens

restaurants  (ตารางเดี่ยว ไม่มี FK เชื่อมกับใคร)
```

ที่มาของข้อมูล: แปลงจาก model ฝั่ง Flutter ใน `frontend/lib/models/` (`user.dart`, `room.dart`, `booking.dart`, `restaurant.dart`) ซึ่งเดิมโหลดจาก `frontend/lib/data/mock_data.dart`

---

## 2. Convention ที่ใช้ทั้งระบบ

กฎเหล่านี้บังคับใช้กับทุกตาราง ห้ามแหกโดยไม่บันทึกเหตุผลไว้ในเอกสารนี้

1. **ชื่อคอลัมน์เป็น snake_case** ใน DB แต่ property ใน entity เป็น camelCase ผูกกันด้วย `@Column({ name: 'xxx_yyy' })`
2. **PK เป็น uuid** (`DEFAULT gen_random_uuid()`) ยกเว้น `bookings` — ดูเหตุผลในหัวข้อ 3.4
3. **เงินใช้ `numeric(10,2)` เท่านั้น** ห้ามใช้ `float` / `double precision` เด็ดขาด เพราะปัดเศษผิด
4. **เวลาใช้ `timestamptz`** ยกเว้นวันเช็คอิน/เช็คเอาต์ที่ใช้ `date` — ดูเหตุผลในหัวข้อ 3.4
5. **`created_at` / `updated_at`** ใช้ `@CreateDateColumn` / `@UpdateDateColumn` ชนิด `timestamptz` ทุกตารางที่มีการแก้ไข
6. **Enum สร้างเป็น PostgreSQL enum type** ตั้งชื่อ `<table>_<column>_enum` ให้ตรงกับที่ TypeORM generate เอง
7. **คอลัมน์ที่ `nullable: true` และประกาศ TypeScript เป็น union (`string | null`, `Date | null`) ต้องระบุ `type` ใน `@Column` เสมอ**
   เหตุผล: union type สะท้อนผ่าน `reflect-metadata` ออกมาเป็น `Object` ทำให้ TypeORM ตาย
   `DataTypeNotSupportedError: Data type "Object" in "X.y" is not supported`
   เคยพลาดมาแล้วกับ `users.phone` — ทุกคอลัมน์ในเอกสารนี้ที่มีเครื่องหมาย `?` ในคอลัมน์ Null เข้าข่ายกฎนี้ทั้งหมด

---

## 3. นิยามตาราง

### 3.1 users — สร้างแล้ว

จาก `AppUser` ใน `frontend/lib/models/user.dart` แต่เปลี่ยน `password` (plain text ใน mock) เป็น bcrypt hash

| คอลัมน์ | ชนิด | Null | หมายเหตุ |
|---|---|---|---|
| id | uuid PK | | `gen_random_uuid()` |
| name | varchar(120) | | |
| email | varchar(255) | | unique index บน `LOWER(email)` |
| phone | varchar(30) | ? | ต้องระบุ `type: 'varchar'` (กฎข้อ 7) |
| password_hash | varchar(100) | | bcrypt cost 12, ตั้ง `select: false` |
| role | enum | | `customer` / `staff` / `admin` |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

`role` map ตรงกับ `UserRole` ใน Dart และใช้กับ `@Roles()` guard ฝั่ง NestJS

### 3.2 refresh_tokens — สร้างแล้ว

แยกจาก `users` เพราะผู้ใช้คนเดียวล็อกอินหลายเครื่องได้ และต้อง revoke ทีละเครื่อง

| คอลัมน์ | ชนิด | Null | หมายเหตุ |
|---|---|---|---|
| id | uuid PK | | |
| user_id | uuid FK → users(id) | | `ON DELETE CASCADE` |
| token_hash | varchar(64) | | unique, sha256 ของ token ดิบ |
| expires_at | timestamptz | | |
| revoked_at | timestamptz | ? | null = ยังใช้ได้ |
| created_at | timestamptz | | |

Token ดิบไม่เคยถูกเก็บลง DB และถูก rotate ทุกครั้งที่เรียก `/api/auth/refresh` (ตัวเก่าโดน revoke ทันที)

### 3.3 rooms — Sprint 2

จาก `Room` ใน `frontend/lib/models/room.dart`

| คอลัมน์ | ชนิด | Null | หมายเหตุ |
|---|---|---|---|
| id | uuid PK | | |
| name | varchar(120) | | เช่น `P2`, `F1` |
| type | enum | | `standard` / `deluxe` / `suite` / `family` |
| price_per_night | numeric(10,2) | | |
| capacity | smallint | | จำนวนผู้เข้าพักสูงสุด |
| description | text | | |
| image_urls | jsonb | | array ของ string, default `'[]'` |
| amenities | jsonb | | array ของ string, default `'[]'` |
| status | enum | | `available` / `maintenance` |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

**CHECK constraint:**

```sql
CHECK (price_per_night >= 0)
CHECK (capacity > 0)
```

**หมายเหตุ TypeORM:** `image_urls` / `amenities` ประกาศเป็น `@Column({ type: 'jsonb', default: () => "'[]'" })` พร้อม property `string[]`

**เหตุผลที่ใช้ jsonb ไม่แยกตาราง amenities:** ฝั่งแอปใช้แค่แสดงเป็น chip ใน `room_detail_screen` ไม่เคยค้นหาแบบ "ห้องไหนมี wifi บ้าง" ถ้าอนาคตต้องกรองด้วย amenity ให้เพิ่ม GIN index บน jsonb แทนการย้าย schema

### 3.4 bookings — Sprint 2 (ตารางสำคัญที่สุด)

จาก `Booking` ใน `frontend/lib/models/booking.dart` ตัด `roomName` / `customerName` ออกเพราะเป็น denormalized data ที่ฝั่ง DB จะ join เอา

| คอลัมน์ | ชนิด | Null | หมายเหตุ |
|---|---|---|---|
| id | varchar(16) PK | | รูปแบบ `b-XXXXXX` (uppercase) |
| room_id | uuid FK → rooms(id) | | `ON DELETE RESTRICT` |
| customer_id | uuid FK → users(id) | | `ON DELETE RESTRICT` |
| check_in | date | | |
| check_out | date | | |
| guests | smallint | | |
| total_price | numeric(10,2) | | ราคารวมทั้งการจอง ไม่ใช่ต่อคืน |
| status | enum | | `pending` / `approved` / `cancelled` |
| payment_status | enum | | `unpaid` / `paid` / `refunded` |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

**Exclusion constraint — หัวใจของ Sprint 2:**

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status <> 'cancelled');
```

`'[)'` คือรวมวันเช็คอิน ไม่รวมวันเช็คเอาต์ ตรงกับ logic `Booking.overlaps()` เดิม — จองวันที่ 15–18 ต่อจาก 10–15 ได้ ไม่นับว่าทับ

**CHECK constraint:**

```sql
CHECK (check_out > check_in)
CHECK (guests > 0)
CHECK (total_price >= 0)
```

**เหตุผลที่ `id` เป็น varchar ไม่ใช่ uuid:** ลูกค้าต้องอ่านรหัสจองทางโทรศัพท์หรือแจ้งหน้าเคาน์เตอร์ได้ uuid ยาวเกินไป ส่วนตารางอื่นไม่มีใครต้องอ่านด้วยปาก จึงใช้ uuid ได้

**เหตุผลที่ `check_in`/`check_out` เป็น `date` ไม่ใช่ `timestamptz`:** โรงแรมคิดค่าห้องเป็นคืน ไม่ใช่ชั่วโมง ถ้าเก็บเป็น timestamp จะเจอปัญหา timezone ทำให้การจองข้ามวันผิดพลาด และ `daterange` ใน exclusion constraint ต้องการชนิด `date`

### 3.5 payments — Sprint 4

แยกจาก `bookings` เพราะข้อมูลจาก payment gateway มี lifecycle ของตัวเอง (webhook มาทีหลัง, retry, refund)

| คอลัมน์ | ชนิด | Null | หมายเหตุ |
|---|---|---|---|
| id | uuid PK | | |
| booking_id | varchar(16) FK → bookings(id) | | **unique** (ความสัมพันธ์ 1:1) |
| method | enum | | `card` / `promptpay` |
| amount | numeric(10,2) | | |
| gateway_ref | varchar(100) | ? | id ฝั่ง Omise/2C2P/Stripe |
| idempotency_key | varchar(100) | | unique, กัน webhook ยิงซ้ำ |
| status | enum | | `pending` / `succeeded` / `failed` / `refunded` |
| paid_at | timestamptz | ? | |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

**ห้ามเก็บเลขบัตรเครดิต หมายเลข CVV หรือข้อมูลบัตรใด ๆ** ส่งต่อ PCI-compliant gateway แล้วเก็บเฉพาะ `gateway_ref` ตามเอกสารหัวข้อ 10

### 3.6 notifications_log — Sprint 4

บันทึกผลของ BullMQ job ที่ส่งอีเมล/SMS ยืนยันการจอง

| คอลัมน์ | ชนิด | Null | หมายเหตุ |
|---|---|---|---|
| id | uuid PK | | |
| booking_id | varchar(16) FK → bookings(id) | | `ON DELETE CASCADE` |
| channel | enum | | `email` / `sms` |
| recipient | varchar(255) | | เก็บค่า ณ เวลาส่ง เผื่อผู้ใช้เปลี่ยนอีเมลภายหลัง |
| payload | jsonb | | เนื้อหาที่ส่งจริง |
| status | enum | | `queued` / `sent` / `failed` |
| attempts | smallint | | default 0, BullMQ retry 3 ครั้ง exponential backoff |
| last_error | text | ? | |
| created_at | timestamptz | | |
| updated_at | timestamptz | | |

### 3.7 restaurants — Sprint 4

จาก `Restaurant` ใน `frontend/lib/models/restaurant.dart`

| คอลัมน์ | ชนิด | Null | หมายเหตุ |
|---|---|---|---|
| id | uuid PK | | |
| name | varchar(120) | | |
| cuisine | varchar(60) | | |
| rating | numeric(2,1) | | 0.0–5.0 |
| price_range | varchar(10) | | เช่น `$`, `$$`, `$$$` |
| address | varchar(255) | | |
| latitude | numeric(9,6) | | |
| longitude | numeric(9,6) | | |

**`distanceKm` ที่มีใน Dart model ไม่เก็บใน DB** — คำนวณจากพิกัดโรงแรมตอน query เพราะถ้า cache ไว้แล้วโรงแรมย้ายที่ ข้อมูลจะผิดทันทีทุกแถว

---

## 4. Index

```sql
-- my_bookings_screen: รายการจองของลูกค้า เรียงใหม่สุดก่อน
CREATE INDEX idx_bookings_customer ON bookings (customer_id, created_at DESC);

-- dashboard_screen: นับจำนวน pending (partial index เล็กและเร็ว)
CREATE INDEX idx_bookings_status_pending ON bookings (status) WHERE status = 'pending';

-- room_search_screen: กรองห้องว่างตามประเภทและราคา
CREATE INDEX idx_rooms_search ON rooms (status, type, price_per_night);
```

Exclusion constraint ของ `bookings` สร้าง GiST index ให้เองอัตโนมัติ ใช้เร่ง query หาช่วงวันที่ทับซ้อนได้ด้วย ไม่ต้องสร้างซ้ำ

---

## 5. ประเด็นที่ยังไม่ตัดสินใจ

ทั้ง 3 ข้อนี้ยังไม่ได้ข้อสรุปจากเจ้าของโปรเจกต์ (Chai) ห้าม implement โดยเดาเอง ให้ถามก่อน

| # | ประเด็น | ตัวเลือก | ข้อเสนอแนะ |
|---|---|---|---|
| 1 | `rooms.amenities` | jsonb กับ แยกตาราง `amenities` + `room_amenities` | jsonb (ตามเหตุผลในหัวข้อ 3.3) |
| 2 | `bookings.id` | `b-XXXXXX` กับ uuid ให้เหมือนตารางอื่น | คง `b-XXXXXX` (ตามเหตุผลในหัวข้อ 3.4) |
| 3 | Soft delete ของ `rooms` | เพิ่ม `deleted_at` กับ คง FK `RESTRICT` | ยังไม่สรุป — ปัจจุบันตั้ง RESTRICT คือถ้ามีประวัติการจองอยู่จะลบห้องไม่ได้เลย ซึ่งอาจไม่ตรงกับ `manage_rooms_screen` ที่มีปุ่มลบห้อง |

---

## 6. ลำดับงาน Sprint 2 (ทำตามนี้)

1. เขียน migration เดียวที่สร้าง `rooms` แล้วตามด้วย `bookings` **พร้อม exclusion constraint และ CHECK ทั้งหมดตั้งแต่ต้น** — ห้ามสร้างตารางก่อนแล้วค่อยเติม constraint ทีหลัง
2. สร้าง entity `Room`, `Booking` ให้ตรงกับ migration (ระวังกฎข้อ 7 ในหัวข้อ 2)
3. `RoomsModule` — `GET /api/rooms` ค้นหาห้องว่าง รับ query `checkIn`, `checkOut`, `type`, `minPrice`, `maxPrice`, `guests` **ยังไม่ใส่ Redis cache ในสprint นี้**
4. `BookingsModule` — `POST /api/bookings` ห่อด้วย `dataSource.transaction('SERIALIZABLE', ...)` และ `SELECT ... FOR UPDATE` บนแถวห้อง จับ constraint violation แปลงเป็น `ConflictException` (HTTP 409)
5. เขียน seed script ย้ายข้อมูลจาก `frontend/lib/data/mock_data.dart` เข้า `rooms` เพื่อให้แอปมีห้องให้ค้นหา

**Definition of done ของ Sprint 2:** integration test ที่ยิง `POST /api/bookings` สองครั้งพร้อมกัน สำหรับห้องเดียวกันและช่วงวันที่ทับกัน ต้องได้ `201` หนึ่งครั้งและ `409` หนึ่งครั้ง ไม่ใช่ 201 ทั้งคู่

---

## 7. คำสั่งที่ใช้บ่อย

รันจาก PowerShell บน Windows ที่ `E:\mobile-app-final-project\backend` เท่านั้น

```powershell
npm run typeorm -- migration:show          # ดูว่า migration ไหนรันไปแล้ว
npm run migration:generate -- src/migrations/<Name>
npm run migration:run
npm run migration:revert                   # ย้อน migration ล่าสุด 1 ตัว

docker compose up -d postgres redis
docker compose ps                          # postgres ต้องเป็น healthy
docker compose exec postgres psql -U poonsuk -d poonsuk -c "\dt"
```

**ค่า connection ปัจจุบัน:** host `localhost` port **5433** (compose map `5433:5432` เพราะ 5432 บนเครื่องถูก PostgreSQL ตัวอื่นยึดไว้) user/db `poonsuk`
เมื่อ API รันใน docker compose เอง `docker-compose.yml` override เป็น `postgres:5432` ให้อัตโนมัติ ไม่ต้องแก้ `.env`

---

## 8. สิ่งที่ฝั่ง Flutter รออยู่

`frontend/lib/repositories/` มี abstract class ที่ตั้งชื่อ method ให้ตรงกับ endpoint ไว้แล้ว (Sprint 0 เสร็จแล้ว) เมื่อ API พร้อม ให้สร้าง `ApiRoomRepository` / `ApiBookingRepository` แล้วสลับที่ `frontend/lib/main.dart` จุดเดียว ไม่ต้องแก้ Bloc, screen หรือ widget ใด ๆ

JSON ที่ API ตอบกลับควรใช้ key แบบ camelCase ให้ตรงกับ property ใน Dart model เพื่อให้เขียน `fromJson` ได้ตรงไปตรงมา:

```json
{
  "id": "b-A3F92C",
  "roomId": "...", "roomName": "P2",
  "customerId": "...", "customerName": "Jane Customer",
  "checkIn": "2026-10-03", "checkOut": "2026-10-06",
  "guests": 2, "totalPrice": 1950,
  "status": "approved", "paymentStatus": "paid",
  "createdAt": "2026-09-15T08:12:00Z"
}
```

`roomName` และ `customerName` ไม่มีในตาราง `bookings` ให้ join มาใส่ตอน serialize เพราะ Dart model ฝั่งแอปยังต้องการฟิลด์นี้
