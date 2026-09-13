import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { AuthResponse } from '@syncevent/shared';
import { env } from '../../env';
import { AccessTokenBlocklistService } from './access-token-blocklist.service';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const GRACE_PERIOD_MS = 10 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private accessTokenBlocklist: AccessTokenBlocklistService,
  ) { }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    try {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      const user = await this.prisma.user.create({
        data: { email: dto.email, password: hashedPassword },
      });
      const familyId = randomUUID();
      const { accessJti, ...tokens } = await this.getTokens(user.id, user.email, familyId);
      await this.createRefreshTokenSession(user.id, familyId, tokens.refreshToken, accessJti);
      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName ?? null,
          avatarUrl: user.avatarUrl ?? null,
        },
        ...tokens,
      };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User with this email already exists');
      }
      throw error;
    }
  }

  async login(dto: RegisterDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');
    const familyId = randomUUID();
    const { accessJti, ...tokens } = await this.getTokens(user.id, user.email, familyId);
    await this.createRefreshTokenSession(user.id, familyId, tokens.refreshToken, accessJti);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
      },
      ...tokens,
    };
  }

  async refreshTokens(userId: string, refreshToken: string, familyId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Access Denied');

    const activeSession = await this.prisma.refreshToken.findFirst({
      where: { familyId, revoked: false },
    });

    if (activeSession && activeSession.userId === userId) {
      const isTokenMatch = await bcrypt.compare(refreshToken, activeSession.tokenHash);
      if (isTokenMatch) {
        const tokens = await this.getTokens(user.id, user.email, familyId);
        const newRow = await this.createRefreshTokenSession(
          user.id,
          familyId,
          tokens.refreshToken,
          tokens.accessJti,
        );

        const claim = await this.prisma.refreshToken.updateMany({
          where: { id: activeSession.id, revoked: false },
          data: { revoked: true, supersededAt: new Date(), supersededById: newRow.id },
        });

        if (claim.count === 1) {
          return tokens;
        }

        await this.prisma.refreshToken.delete({ where: { id: newRow.id } });
      }
    }

    const revokedRows = await this.prisma.refreshToken.findMany({
      where: { userId, familyId, revoked: true },
    });

    for (const row of revokedRows) {
      if (!(await bcrypt.compare(refreshToken, row.tokenHash))) continue;

      if (row.supersededById && row.supersededAt && this.isWithinGracePeriod(row.supersededAt)) {
        const currentRow = await this.prisma.refreshToken.findUnique({
          where: { id: row.supersededById },
        });
        if (currentRow && !currentRow.revoked && currentRow.userId === userId) {
          const tokens = await this.getTokens(user.id, user.email, familyId);
          await this.prisma.refreshToken.update({
            where: { id: currentRow.id },
            data: {
              tokenHash: await bcrypt.hash(tokens.refreshToken, 10),
              accessJti: tokens.accessJti,
            },
          });
          return tokens;
        }
      }

      await this.prisma.refreshToken.updateMany({
        where: { familyId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    throw new UnauthorizedException('Access Denied');
  }

  private isWithinGracePeriod(supersededAt: Date): boolean {
    return Date.now() - supersededAt.getTime() <= GRACE_PERIOD_MS;
  }

  async logout(userId: string, familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, familyId, revoked: false },
      data: { revoked: true },
    });
  }

  async logoutAllDevices(userId: string): Promise<void> {
    const liveSessions = await this.prisma.refreshToken.findMany({
      where: { userId, revoked: false },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    await Promise.all(
      liveSessions
        .filter((session) => session.accessJti !== null)
        .map((session) =>
          this.accessTokenBlocklist.revoke(session.accessJti as string, ACCESS_TOKEN_TTL_SECONDS),
        ),
    );
  }

  private async getTokens(userId: string, email: string, familyId: string) {
    const accessJti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, jti: accessJti },
        { expiresIn: '15m', secret: env.JWT_SECRET },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, familyId },
        { expiresIn: '7d', secret: env.JWT_REFRESH_SECRET },
      ),
    ]);
    return { accessToken, refreshToken, accessJti };
  }

  private async createRefreshTokenSession(
    userId: string,
    familyId: string,
    refreshToken: string,
    accessJti: string,
  ) {
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    return this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash,
        accessJti,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
  }
}