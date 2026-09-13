import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AccessTokenBlocklistService } from './access-token-blocklist.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super_secret_key',
      signOptions: { expiresIn: '1d' }, // Зробимо 1 день для зручності розробки
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AccessTokenBlocklistService],
  exports: [AuthService],
})
export class AuthModule {}
