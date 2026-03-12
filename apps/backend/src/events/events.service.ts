import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateEventDto } from './dto/update-event.dto';
import { Visibility } from '@prisma/client';

@Injectable()
export class EventsService {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateEventDto, userId: string) {
    const eventDate = new Date(dto.date as unknown as string);

    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (isNaN(eventDate.getTime()) || eventDate < tomorrow) {
      throw new BadRequestException('Event date must be at least tomorrow');
    }

    return await this.prisma.event.create({
      data: {
        ...dto,
        date: eventDate,
        authorId: userId,
        participants: {
          connect: { id: userId },
        },
      },
      include: {
        author: { select: { email: true, id: true } },
        _count: { select: { participants: true } },
      },
    });
  }

  async findAll(currentUserId?: string) {
    const events = await this.prisma.event.findMany({
      where: currentUserId ? {} : { visibility: Visibility.PUBLIC },
      include: {
        author: { select: { id: true, email: true } },
        _count: { select: { participants: true } },
        participants: currentUserId
          ? { where: { id: currentUserId }, select: { id: true } }
          : false,
      },
    });

    return events.map((event) => ({
      ...event,
      isJoined:
        Array.isArray(event.participants) && event.participants.length > 0,
      participants: undefined,
    }));
  }

  async findOne(id: string, currentUserId?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, email: true, displayName: true } },
        participants: { select: { id: true, email: true, displayName: true } },
        _count: { select: { participants: true } },
      },
    });

    if (!event) throw new NotFoundException('Event not found');

    if (event.visibility === 'PRIVATE') {
      const isAuthor = event.authorId === currentUserId;
      const isParticipant = event.participants.some(
        (p) => p.id === currentUserId,
      );

      if (!isAuthor && !isParticipant) {
        throw new ForbiddenException('This is a private event');
      }
    }

    return event;
  }

  async joinEvent(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        participants: { where: { id: userId } },
        _count: { select: { participants: true } },
      },
    });

    if (!event) throw new NotFoundException('Event not found');

    if (event.participants && event.participants.length > 0) {
      throw new BadRequestException('You are already a participant');
    }

    if (event.capacity && event._count.participants >= event.capacity) {
      throw new BadRequestException('Event is full');
    }

    return this.prisma.event.update({
      where: { id: eventId },
      data: { participants: { connect: { id: userId } } },
    });
  }

  async leaveEvent(eventId: string, userId: string) {
    return this.prisma.event.update({
      where: { id: eventId },
      data: { participants: { disconnect: { id: userId } } },
    });
  }

  async findMyCalendar(userId: string) {
    return this.prisma.event.findMany({
      where: {
        OR: [{ authorId: userId }, { participants: { some: { id: userId } } }],
      },
      include: {
        author: { select: { email: true } },
        _count: { select: { participants: true } },
      },
    });
  }

  async remove(id: string, userId: string) {
    const event = await this.findOne(id);
    if (event.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own events');
    }
    return await this.prisma.event.delete({ where: { id } });
  }

  async update(id: string, userId: string, dto: UpdateEventDto) {
    const event = await this.findOne(id, userId);

    if (event.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own events');
    }

    const { date: dtoDate, ...data } = dto;

    let updatedDate: Date | undefined;

    if (dtoDate) {
      updatedDate = new Date(dtoDate);
      if (isNaN(updatedDate.getTime()) || updatedDate < new Date()) {
        throw new BadRequestException('Invalid date');
      }
    }

    return await this.prisma.event.update({
      where: { id },
      data: {
        ...data,
        ...(updatedDate ? { date: updatedDate } : {}),
      },
    });
  }
}
