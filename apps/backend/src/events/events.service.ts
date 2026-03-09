import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto, userId: string) {
    return await this.prisma.event.create({
      data: {
        ...dto,
        date: new Date(dto.date),
        authorId: userId,
      },
      include: {
        author: {
          select: { email: true },
        },
      },
    });
  }

  async findAll() {
    return await this.prisma.event.findMany({
      include: { author: { select: { id: true, email: true } } },
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { author: { select: { id: true, email: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async remove(id: string, userId: string) {
    const event = await this.findOne(id);

    if (event.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own events');
    }

    return await this.prisma.event.delete({ where: { id } });
  }

  async update(id: string, dto: Record<string, unknown>) {
    const dateStr = dto.date as string | undefined;

    const data = { ...dto };
    delete data.date;

    return await this.prisma.event.update({
      where: { id },
      data: {
        ...data,
        ...(dateStr ? { date: new Date(dateStr) } : {}),
      },
    });
  }
}
