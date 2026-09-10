import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Includes passwordHash (which is `select: false` by default) for login. */
  findByEmailWithSecret(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
  }

  async create(input: {
    name: string; email: string; phone?: string; password: string; role?: UserRole;
  }): Promise<User> {
    const exists = await this.repo.findOne({ where: { email: input.email.toLowerCase() } });
    if (exists) throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');

    const user = this.repo.create({
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      role: input.role ?? UserRole.CUSTOMER,
    });
    return this.repo.save(user);
  }

  async getOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้');
    return user;
  }

  static verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
