import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../modules/users/user.entity';

const ctxWith = (user?: { role: UserRole }) => ({
  getHandler: () => undefined,
  getClass: () => undefined,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
}) as never;

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  afterEach(() => jest.restoreAllMocks());

  it('allows when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(ctxWith())).toBe(true);
  });

  it('allows a user with a required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(guard.canActivate(ctxWith({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('forbids a user without the role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(ctxWith({ role: UserRole.CUSTOMER }))).toThrow(ForbiddenException);
  });

  it('forbids when there is no user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.STAFF]);
    expect(() => guard.canActivate(ctxWith())).toThrow(ForbiddenException);
  });
});
