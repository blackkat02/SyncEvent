import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Visibility } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EventTopics } from '@syncevent/shared';
import { CreateEventDto } from './dto/create-event.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateEventDto } from './dto/update-event.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Writes one transactional-outbox row (docs/architecture/booking-concurrency.md
   * §6.4). MUST be called with the same `tx` as the state change it describes,
   * so the fact and its event commit or roll back together. The row id doubles
   * as the payload's `messageId` for consumer-side dedupe.
   */
  private writeOutbox(
    tx: Prisma.TransactionClient,
    topic: string,
    eventId: string,
    payload: Record<string, unknown>,
  ) {
    const messageId = randomUUID();
    return tx.outboxEvent.create({
      data: {
        id: messageId,
        topic,
        key: eventId,
        payload: { ...payload, messageId, occurredAt: new Date().toISOString() },
      },
    });
  }

  async create(dto: CreateEventDto, userId: string) {
    const eventDate = new Date(dto.date);

    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (isNaN(eventDate.getTime()) || eventDate < tomorrow) {
      throw new BadRequestException('Event date must be at least tomorrow');
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          ...dto,
          date: eventDate,
          authorId: userId,
          // The author is always joined on creation, so the denormalised
          // counter starts at 1 — otherwise the event would accept
          // `capacity + 1` people (organizer + capacity joiners).
          seatsTaken: 1,
          participants: {
            create: { userId },
          },
        },
        include: {
          author: { select: { email: true, id: true } },
          _count: { select: { participants: true } },
        },
      });

      await this.writeOutbox(tx, EventTopics.EVENT_CREATED, event.id, {
        eventId: event.id,
        authorId: userId,
        title: event.title,
        createdAt: event.createdAt.toISOString(),
      });

      return event;
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
            ? { where: { userId: currentUserId }, select: { userId: true } }
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
        participants: {
          include: {
            user: { select: { id: true, email: true, displayName: true } },
          },
        },
        _count: { select: { participants: true } },
      },
    });

    if (!event) throw new NotFoundException('Event not found');

    return {
      ...event,
      // Flatten EventParticipant[] back to a plain user list — keeps the
      // response contract (IEventResponse.participants: IParticipant[])
      // unchanged by the implicit->explicit join-model migration.
      participants: event.participants.map((p) => p.user),
      isJoined: currentUserId
        ? event.participants.some((p) => p.userId === currentUserId)
        : false,
    };
  }

  async joinEvent(eventId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Лочимо рядок "Event" — серіалізує конкурентні join/leave на цій
      //    же події (той самий лок, що й у leaveEvent).
      await tx.$executeRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;

      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { id: true },
      });
      if (!event) throw new NotFoundException('Event not found');

      // 2. Членство застовплюємо через composite PK (eventId,userId) —
      //    реальний DB-constraint, а не read-then-check підзапит. Дублікат
      //    конфліктує атомарно на рівні БД, тож це закриває residual-гонку
      //    навіть для прямих викликів joinEvent в обхід черги/Redis-claim'у
      //    (docs/architecture/booking-concurrency.md §13).
      const { count: joined } = await tx.eventParticipant.createMany({
        data: [{ eventId, userId }],
        skipDuplicates: true,
      });
      if (joined === 0) {
        throw new ConflictException('You are already a participant');
      }

      // 3. Членство саме собою місця не бронює — лічильник і далі
      //    захищений умовним UPDATE. Кидок звідси відкотить усю
      //    транзакцію, тобто й insert з кроку 2 — тож "зайвого" учасника
      //    без місця не залишиться.
      const { count: seated } = await tx.event.updateMany({
        where: {
          id: eventId,
          OR: [
            { capacity: null },
            { seatsTaken: { lt: this.prisma.event.fields.capacity } },
          ],
        },
        data: { seatsTaken: { increment: 1 } },
      });
      if (seated === 0) {
        throw new ConflictException('Event is full');
      }

      // Факт «користувач приєднався» — у тій самій транзакції (outbox).
      await this.writeOutbox(tx, EventTopics.USER_JOINED, eventId, {
        eventId,
        userId,
        joinedAt: new Date().toISOString(),
      });

      return tx.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { _count: { select: { participants: true } } },
      });
    });
  }

  async leaveEvent(eventId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Лочимо рядок "Event" — серіалізує конкурентні join/leave на цій
      //    же події так само, як умовний UPDATE в joinEvent.
      await tx.$executeRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;

      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { authorId: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      if (event.authorId === userId) {
        throw new ForbiddenException('The organizer cannot leave their own event');
      }

      // 2. Членство знімаємо через explicit-модель EventParticipant — сама
      //    умова (eventId,userId) в WHERE і є перевіркою "чи був учасником",
      //    без окремого read перед мутацією (composite PK гарантує, що це
      //    рівно 0 або 1 рядок).
      const { count } = await tx.eventParticipant.deleteMany({
        where: { eventId, userId },
      });
      if (count === 0) {
        throw new ConflictException('You are not a participant of this event');
      }

      // 3. Місце звільнилося — знімаємо його, не пускаючи лічильник у мінус
      //    (симетрично до joinEvent).
      await tx.$executeRaw`
        UPDATE "Event" SET "seatsTaken" = GREATEST("seatsTaken" - 1, 0) WHERE id = ${eventId}
      `;

      await this.writeOutbox(tx, EventTopics.USER_LEFT, eventId, {
        eventId,
        userId,
        leftAt: new Date().toISOString(),
      });

      return tx.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { _count: { select: { participants: true } } },
      });
    });
  }

  async findMyCalendar(userId: string) {
    const events = await this.prisma.event.findMany({
      where: {
        OR: [{ authorId: userId }, { participants: { some: { userId } } }],
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
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.event.delete({ where: { id } });
      await this.writeOutbox(tx, EventTopics.EVENT_DELETED, id, {
        eventId: id,
        deletedBy: userId,
        deletedAt: new Date().toISOString(),
      });
      return deleted;
    });
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
