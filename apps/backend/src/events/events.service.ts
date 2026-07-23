import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Visibility } from '@prisma/client';
import { CreateEventDto } from './dto/create-event.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateEventDto } from './dto/update-event.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateEventDto, userId: string) {
    const eventDate = new Date(dto.date);

    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('=== DATE DEBUG ===');
    console.log('raw dto.date:', dto.date);
    console.log('parsed eventDate:', eventDate.toISOString());
    console.log('server tomorrow:', tomorrow.toISOString());
    console.log('server TZ offset (min):', new Date().getTimezoneOffset());

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

  async findAll(currentUserId?: string, pagination?: PaginationDto) {
    const page = Math.max(1, pagination?.page || 1);
    const limit = Math.max(1, Math.min(pagination?.limit || 10, 100));
    const skip = (page - 1) * limit;

    const whereCondition = currentUserId
      ? {}
      : { visibility: Visibility.PUBLIC };

    const [events, totalItems] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where: whereCondition,
        skip: skip,
        take: limit,
        include: {
          author: { select: { id: true, email: true } },
          _count: { select: { participants: true } },
          participants: currentUserId
            ? { where: { id: currentUserId }, select: { id: true } }
            : false,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.event.count({ where: whereCondition }),
    ]);

    const mappedEvents = events.map(
      (event: { participants: string | any[] }) => ({
        ...event,
        isJoined:
          Array.isArray(event.participants) && event.participants.length > 0,
        participants: undefined,
      }),
    );

    return {
      data: mappedEvents,
      meta: {
        totalItems,
        itemCount: mappedEvents.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
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

    return {
      ...event,
      isJoined: currentUserId
        ? event.participants.some((p: { id: string }) => p.id === currentUserId)
        : false,
    };
  }

  async joinEvent(eventId: string, userId: string) {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const event = await tx.event.findUnique({
              where: { id: eventId },
              include: {
                participants: { where: { id: userId } },
                _count: { select: { participants: true } },
              },
            });

            if (!event) throw new NotFoundException('Event not found');

            if (event.participants.length > 0) {
              throw new BadRequestException('You are already a participant');
            }

            if (event.capacity && event._count.participants >= event.capacity) {
              throw new BadRequestException('Event is full');
            }

            return tx.event.update({
              where: { id: eventId },
              data: { participants: { connect: { id: userId } } },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (err) {
        const isSerializationConflict =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === 'P2034' ||
            (err.meta as { code?: string })?.code === '40001');

        if (isSerializationConflict && attempt < maxRetries) {
          continue;
        }
        throw err;
      }
    }
  }

  async leaveEvent(eventId: string, userId: string) {
    return this.prisma.event.update({
      where: { id: eventId },
      data: { participants: { disconnect: { id: userId } } },
    });
  }

  async findMyCalendar(userId: string) {
    const events = await this.prisma.event.findMany({
      where: {
        OR: [{ authorId: userId }, { participants: { some: { id: userId } } }],
      },
      include: {
        author: { select: { id: true, email: true, displayName: true } },
        _count: { select: { participants: true } },
      },
    });

    return events.map((event: { authorId: string }) => ({
      ...event,
      isJoined: true,
      isOrganizer: event.authorId === userId,
    }));
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

    let updatedDate: Date | undefined;

    if (dto.date) {
      updatedDate = new Date(dto.date);
      if (isNaN(updatedDate.getTime()) || updatedDate < new Date()) {
        throw new BadRequestException(
          'Invalid date. Date cannot be in the past.',
        );
      }
    }

    return await this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        capacity: dto.capacity,
        visibility: dto.visibility,
        date: updatedDate ? updatedDate.toISOString() : undefined,
      },
    });
  }
}
