import {
  Controller,
  Post,
  Body,
  UsePipes,
  Get,
  UseGuards,
  UnauthorizedException,
  Res, // ✅ Додали Res
  Req, // ✅ Додали Req
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
import { YupValidationPipe } from '../common/pipes/yup-validation.pipe';
import { GetUser } from '../common/decorators/get-user.decorator';

// ✅ Обов'язково імпортуємо типи Express для роботи з куками
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
      sameSite: 'lax',        // ← було 'strict', змінити на 'lax'
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',              // ← було '/api/auth/refresh', змінити на '/'
    });
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered.' })
  @UsePipes(new YupValidationPipe(registerSchema))
  async register(
    @Body() registerDto: RegisterInput,
    @Res({ passthrough: true }) res: Response, // ✅ Впроваджуємо об'єкт відповіді
  ) {
    const result = await this.authService.register(registerDto);

    // Запікаємо куку
    this.setRefreshTokenCookie(res, result.refreshToken);

    // Повертаємо фронтенду ТІЛЬКИ те, що йому дозволено бачити (без рефреш-токена)
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user and return tokens' })
  @ApiResponse({ status: 200, description: 'Return access token.' })
  @UsePipes(new YupValidationPipe(loginSchema))
  async login(
    @Body() loginDto: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    console.log('LOGIN CALLED, setting cookie...');
    const result = await this.authService.login(loginDto);
    console.log('refreshToken exists:', !!result.refreshToken);

    this.setRefreshTokenCookie(res, result.refreshToken);
    console.log('Cookie set!');

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
    @Req() req: Request, // ✅ Читаємо запит, щоб витягнути куки
    @Res({ passthrough: true }) res: Response,
  ) {
    console.log('All cookies:', req.cookies);
    console.log('Headers:', req.headers.cookie);
    const refreshToken = req.cookies?.['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
      }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret',
      });

      const newTokens = await this.authService.refreshTokens(payload.sub, refreshToken);

      // Оновлюємо куку новим Refresh-токеном (Rotation паттерн)
      this.setRefreshTokenCookie(res, newTokens.refreshToken);

      return {
        accessToken: newTokens.accessToken,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}