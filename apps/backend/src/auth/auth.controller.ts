import {
  Controller,
  Post,
  Body,
  UsePipes,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { registerSchema } from './dto/register.dto';
import type { RegisterDto } from './dto/register.dto';
import { YupValidationPipe } from '../common/pipes/yup-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
