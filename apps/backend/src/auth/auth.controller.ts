import {
  Controller,
  Post,
  Body,
  UsePipes,
  Get,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { registerSchema } from './dto/register.dto';
import type { RegisterDto } from './dto/register.dto';
import { YupValidationPipe } from '../common/pipes/yup-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('register')
  @UsePipes(new YupValidationPipe(registerSchema))
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @UsePipes(new YupValidationPipe(registerSchema))
  async login(@Body() loginDto: RegisterDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: { user: { id: string; email: string } }) {
    return req.user;
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      interface JwtPayload {
        sub: string;
        email: string;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret',
        },
      );

      return this.authService.refreshTokens(payload.sub, refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
