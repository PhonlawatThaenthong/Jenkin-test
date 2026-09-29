import { nightsBetween, toBookingResponse } from './booking.response';

describe('booking.response', () => {
  it('nightsBetween counts check-out day as exclusive', () => {
    expect(nightsBetween('2026-10-01', '2026-10-04')).toBe(3);
  });

  it('toBookingResponse falls back to empty names without relations', () => {
    const res = toBookingResponse({
      id: 'b1', roomId: 'r1', customerId: 'c1', checkIn: '2026-10-01', checkOut: '2026-10-02',
      guests: 1, totalPrice: 100, status: 'pending', paymentStatus: 'unpaid', createdAt: new Date(),
    } as never);
    expect(res).toMatchObject({ roomName: '', customerName: '', nights: 1 });
  });
});
