/**
 * Controllers are thin: each handler forwards to a service. These tests pin
 * that wiring (right method, right arguments, right response shape).
 */
import { AuthController } from './auth/auth.controller';
import { BookingsController } from './bookings/bookings.controller';
import { StaffBookingsController } from './bookings/staff-bookings.controller';
import { RoomsController } from './rooms/rooms.controller';
import { StaffRoomsController } from './rooms/staff-rooms.controller';
import { StaffUsersController } from './users/staff-users.controller';
import { HealthController } from './health/health.controller';
import { UserRole } from './users/user.entity';

// bcrypt is a native addon; unit tests never need real hashing.
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));


const actor = { sub: 'u1', email: 'a@b.com', role: UserRole.CUSTOMER };
const fullUser = {
  id: 'u1', name: 'N', email: 'a@b.com', phone: null, role: UserRole.CUSTOMER, passwordHash: 'secret',
};
const publicUser = { id: 'u1', name: 'N', email: 'a@b.com', phone: null, role: UserRole.CUSTOMER };

describe('AuthController', () => {
  const auth = {
    register: jest.fn().mockResolvedValue('t'), login: jest.fn().mockResolvedValue('t'),
    refresh: jest.fn().mockResolvedValue('t'), logout: jest.fn(),
  };
  const users = { getOrFail: jest.fn().mockResolvedValue(fullUser) };
  const ctrl = new AuthController(auth as never, users as never);

  it('forwards register/login/refresh/logout', async () => {
    await ctrl.register({ name: 'N', email: 'a@b.com', password: 'p' });
    await ctrl.login({ email: 'a@b.com', password: 'p' });
    await ctrl.refresh({ refreshToken: 'r' });
    await ctrl.logout({ refreshToken: 'r' });
    expect(auth.register).toHaveBeenCalled();
    expect(auth.login).toHaveBeenCalled();
    expect(auth.refresh).toHaveBeenCalledWith('r');
    expect(auth.logout).toHaveBeenCalledWith('r');
  });

  it('me returns the public profile only', async () => {
    await expect(ctrl.me(actor)).resolves.toEqual(publicUser);
    expect(users.getOrFail).toHaveBeenCalledWith('u1');
  });
});

describe('BookingsController', () => {
  const svc = { create: jest.fn(), findForCustomer: jest.fn(), markPaid: jest.fn(), cancel: jest.fn() };
  const ctrl = new BookingsController(svc as never);

  it('takes the customer from the JWT', () => {
    const dto = { roomId: 'r1', checkIn: '2026-10-01', checkOut: '2026-10-02', guests: 1 };
    ctrl.create(actor, dto);
    ctrl.mine(actor);
    ctrl.pay(actor, 'b1');
    ctrl.cancel(actor, 'b1');
    expect(svc.create).toHaveBeenCalledWith('u1', dto);
    expect(svc.findForCustomer).toHaveBeenCalledWith('u1');
    expect(svc.markPaid).toHaveBeenCalledWith('b1', 'u1', UserRole.CUSTOMER);
    expect(svc.cancel).toHaveBeenCalledWith('b1', 'u1', UserRole.CUSTOMER);
  });
});

describe('StaffBookingsController', () => {
  const svc = { findAll: jest.fn(), getOrFail: jest.fn(), update: jest.fn() };
  const ctrl = new StaffBookingsController(svc as never);

  it('forwards to the service', () => {
    ctrl.findAll();
    ctrl.findOne('b1');
    ctrl.update('b1', {});
    expect(svc.findAll).toHaveBeenCalled();
    expect(svc.getOrFail).toHaveBeenCalledWith('b1');
    expect(svc.update).toHaveBeenCalledWith('b1', {});
  });
});

describe('RoomsController', () => {
  const svc = { search: jest.fn(), getOrFail: jest.fn() };
  const ctrl = new RoomsController(svc as never);

  it('forwards to the service', () => {
    ctrl.find({ guests: 2 });
    ctrl.findOne('r1');
    expect(svc.search).toHaveBeenCalledWith({ guests: 2 });
    expect(svc.getOrFail).toHaveBeenCalledWith('r1');
  });
});

describe('StaffRoomsController', () => {
  const svc = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
  const repo = { find: jest.fn() };
  const ctrl = new StaffRoomsController(svc as never, repo as never);

  it('lists all rooms by name, including maintenance', () => {
    ctrl.findAll();
    expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
  });

  it('forwards create/update/remove', async () => {
    ctrl.create({} as never);
    ctrl.update('r1', {} as never);
    await ctrl.remove('r1');
    expect(svc.create).toHaveBeenCalled();
    expect(svc.update).toHaveBeenCalledWith('r1', {});
    expect(svc.remove).toHaveBeenCalledWith('r1');
  });
});

describe('StaffUsersController', () => {
  const svc = {
    list: jest.fn().mockResolvedValue([fullUser]),
    create: jest.fn().mockResolvedValue(fullUser),
    remove: jest.fn(),
  };
  const ctrl = new StaffUsersController(svc as never);

  it('never exposes the password hash', async () => {
    await expect(ctrl.findAll()).resolves.toEqual([publicUser]);
    await expect(ctrl.create({} as never)).resolves.toEqual(publicUser);
  });

  it('passes the acting user to remove', async () => {
    await ctrl.remove(actor, 'u2');
    expect(svc.remove).toHaveBeenCalledWith('u2', 'u1');
  });
});

describe('HealthController', () => {
  const health = { check: jest.fn(async (fns: Array<() => unknown>) => Promise.all(fns.map((f) => f()))) };
  const db = { pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }) };
  const ctrl = new HealthController(health as never, db as never);

  it('live reports ok without touching dependencies', () => {
    expect(ctrl.live()).toMatchObject({ status: 'ok' });
    expect(db.pingCheck).not.toHaveBeenCalled();
  });

  it('ready pings the database', async () => {
    await ctrl.ready();
    expect(db.pingCheck).toHaveBeenCalledWith('database', { timeout: 1500 });
  });
});
