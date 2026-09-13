import {
  Controller,
  Post,
  Body,
  UsePipes,
  Get,
  UseGuards,
  UnauthorizedException,
  Res,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  registerSchema,
  loginSchema,
  AuthResponse,
  type LoginInput,
  type UserProfile,
  type RegisterInput,
} from '@syncevent/shared';
import { ZodValidationPipe } from 'nestjs-zod';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Request, Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) { }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered.' })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(
    @Body() registerDto: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(registerDto);

    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user and return tokens' })
  @ApiResponse({ status: 200, description: 'Return access token.' })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() loginDto: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);

    this.setRefreshTokenCookie(res, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Get('profile')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@GetUser() user: UserProfile): UserProfile {
    return user;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token from cookies' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        familyId: string;
      }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret',
      });

      const newTokens = await this.authService.refreshTokens(
        payload.sub,
        refreshToken,
        payload.familyId,
      );

      this.setRefreshTokenCookie(res, newTokens.refreshToken);

      return {
        accessToken: newTokens.accessToken,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current refresh-token session and clear its cookie' })
  @ApiResponse({ status: 200, description: 'Logged out.' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['refreshToken'];
    this.clearRefreshTokenCookie(res);

    if (refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync<{
          sub: string;
          email: string;
          familyId: string;
        }>(refreshToken, {
          secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret',
        });

        await this.authService.logout(payload.sub, payload.familyId);
      } catch {
        // Invalid/expired token: nothing to revoke.
      }
    }

    return { success: true };
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Revoke every session for this user and blocklist their current access tokens',
  })
  @ApiResponse({ status: 200, description: 'Logged out everywhere.' })
  async logoutAll(
    @GetUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearRefreshTokenCookie(res);
    await this.authService.logoutAllDevices(userId);
    return { success: true };
  }
}