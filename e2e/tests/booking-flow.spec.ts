import { test, expect } from '@playwright/test';

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test.describe.serial('booking flow', () => {
  let roomId: string;
  let token: string;
  let bookingId: string;

  test('list rooms', async ({ request }) => {
    const res = await request.get('/api/rooms');
    expect(res.status()).toBe(200);
    const rooms = await res.json();
    expect(rooms.length).toBeGreaterThan(0);
    roomId = rooms[0].id;
  });

  test('create booking', async ({ request }) => {
    const reg = await request.post('/api/auth/register', {
      data: { name: 'E2E User', email: `e2e-${Date.now()}@test.local`, password: 'Passw0rd!' },
    });
    expect(reg.status()).toBe(201);
    token = (await reg.json()).accessToken;

    const res = await request.post('/api/bookings', {
      headers: { Authorization: `Bearer ${token}` },
      data: { roomId, checkIn: day(30), checkOut: day(32), guests: 2 },
    });
    expect(res.status()).toBe(201);
    const booking = await res.json();
    expect(booking.status).toBe('pending');
    bookingId = booking.id;
  });

  test('mark booking paid', async ({ request }) => {
    const res = await request.post(`/api/bookings/${bookingId}/pay`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const booking = await res.json();
    expect(booking.paymentStatus).toBe('paid');
    expect(booking.status).toBe('approved');
  });
});