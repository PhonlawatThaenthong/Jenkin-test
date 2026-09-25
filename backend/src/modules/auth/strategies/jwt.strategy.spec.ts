import { JwtStrategy } from './jwt.strategy';
import { UserRole } from '../../users/user.entity';

describe('JwtStrategy', () => {
  it('passes the payload through as request.user', () => {
    const payload = { sub: 'u1', email: 'a@b.com', role: UserRole.CUSTOMER };
    expect(new JwtStrategy().validate(payload)).toBe(payload);
  });
});
