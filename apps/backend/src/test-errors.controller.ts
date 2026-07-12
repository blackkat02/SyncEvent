import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

type User = { id: number; name: string; email: string };

function sendEmail(user: User) {
  console.log(user.email);
}

@Controller('test')
export class TestController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    const user: User = { id: 1, name: 'Alice', email: 'a@b.com' };
    sendEmail(user);
  }
}
