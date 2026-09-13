import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { env } from '../../../env';
import { AccessTokenBlocklistService } from '../access-token-blocklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private accessTokenBlocklist: AccessTokenBlocklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; email: string; jti?: string }) {
    if (payload.jti && (await this.accessTokenBlocklist.isRevoked(payload.jti))) {
      throw new UnauthorizedException('Access token revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { id: user.id, email: user.email };
  }
}
