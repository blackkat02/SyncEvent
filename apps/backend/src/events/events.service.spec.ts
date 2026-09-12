import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Visibility } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';

/**
 * Unit tests for {@link EventsService}.
 *
 * The service only depends on {@link PrismaService}, so every test runs against
 * an in-memory mock of the Prisma client - no database is touched.
 */

type PrismaEventMock = {
  create: jest.Mock;
  findMany: jest.Mock;
  findUnique: jest.Mock;
  findUniqueOrThrow: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  /** Prisma field-reference handle, used by the conditional increment. */
  fields: { capacity: unknown };
};

type PrismaEventParticipantMock = {
  createMany: jest.Mock;
  deleteMany: jest.Mock;
};

type OutboxMock = { create: jest.Mock };

type PrismaMock = {
  event: PrismaEventMock;
  eventParticipant: PrismaEventParticipantMock;
  outboxEvent: OutboxMock;
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
};

const createPrismaMock = (): PrismaMock => {
  const event: PrismaEventMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    fields: { capacity: 'capacity' },
  };

  const eventParticipant: PrismaEventParticipantMock = {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  };

  const outboxEvent: OutboxMock = { create: jest.fn() };
  const $executeRaw = jest.fn();

  const $transaction = jest.fn((arg: unknown) => {
    // Callback form: prisma.$transaction(async (tx) => { ... })
    if (typeof arg === 'function') {
      return (
        arg as (tx: {
          event: PrismaEventMock;
          eventParticipant: PrismaEventParticipantMock;
          outboxEvent: OutboxMock;
          $executeRaw: jest.Mock;
        }) => unknown
      )({ event, eventParticipant, outboxEvent, $executeRaw });
    }
    // Array form: prisma.$transaction([p1, p2])
    return Promise.all(arg as Promise<unknown>[]);
  });

  return { event, eventParticipant, outboxEvent, $transaction, $executeRaw };
};

/** A date guaranteed to satisfy the "at least tomorrow" rule. */
const futureDateIso = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toISOString();
};

describe('EventsService', () => {
  let service: EventsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const baseDto = (): CreateEventDto => ({
      title: 'Team sync',
      location: 'Kyiv',
      date: futureDateIso(),
      visibility: Visibility.PUBLIC as CreateEventDto['visibility'],
    });

    it('rejects a date that is in the past', async () => {
      const dto = { ...baseDto(), date: '2000-01-01T00:00:00.000Z' };

      await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('rejects an unparseable date', async () => {
      const dto = { ...baseDto(), date: 'not-a-date' };

      await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('persists the event with the author connected as a participant', async () => {
      const dto = baseDto();
      const created = {
        id: 'event-1',
        ...dto,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      };
      prisma.event.create.mockResolvedValue(created);

      const result = await service.create(dto, 'user-1');

      expect(result).toBe(created);
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      const arg = prisma.event.create.mock.calls[0][0];
      expect(arg.data.authorId).toBe('user-1');
      expect(arg.data.date).toBeInstanceOf(Date);
      expect(arg.data.date.toISOString()).toBe(dto.date);
      expect(arg.data.participants).toEqual({ create: { userId: 'user-1' } });
      expect(arg.data.seatsTaken).toBe(1); // author counts as the first seat
    });

    it('writes an event.created outbox row in the same transaction', async () => {
      const dto = baseDto();
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        title: dto.title,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      });

      await service.create(dto, 'user-1');

      const outboxArg = prisma.outboxEvent.create.mock.calls[0][0];
      expect(outboxArg.data.topic).toBe('event.created');
      expect(outboxArg.data.key).toBe('event-1');
      expect(outboxArg.data.payload).toMatchObject({
        eventId: 'event-1',
        authorId: 'user-1',
        title: dto.title,
        messageId: outboxArg.data.id,
      });
    });
  });

  describe('findAll', () => {
    it('only returns public events for anonymous callers', async () => {
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.findAll(undefined);

      expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({
        visibility: Visibility.PUBLIC,
      });
      expect(prisma.event.count.mock.calls[0][0].where).toEqual({
        visibility: Visibility.PUBLIC,
      });
    });

    it('returns every event for an authenticated caller', async () => {
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.findAll('user-1');

      expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({});
    });

    it('clamps pagination and computes meta', async () => {
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(250);

      const result = await service.findAll('user-1', { page: 0, limit: 999 });

      const findManyArg = prisma.event.findMany.mock.calls[0][0];
      expect(findManyArg.take).toBe(100); // limit clamped to max 100
      expect(findManyArg.skip).toBe(0); // page clamped to min 1 -> (1-1)*100
      expect(result.meta).toEqual({
        totalItems: 250,
        itemCount: 0,
        itemsPerPage: 100,
        totalPages: 3,
        currentPage: 1,
      });
    });

    it('flags joined events and hides the raw participants list', async () => {
      prisma.event.findMany.mockResolvedValue([
        { id: 'a', participants: [{ userId: 'user-1' }] },
        { id: 'b', participants: [] },
      ]);
      prisma.event.count.mockResolvedValue(2);

      const result = await service.findAll('user-1');

      expect(result.data).toEqual([
        { id: 'a', isJoined: true, participants: undefined },
        { id: 'b', isJoined: false, participants: undefined },
      ]);
    });
  });

  describe('findOne', () => {
    it('throws when the event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reports isJoined = false when no user is provided', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        participants: [{ userId: 'user-1', user: { id: 'user-1' } }],
      });

      const result = await service.findOne('e1');

      expect(result.isJoined).toBe(false);
    });

    it('reports isJoined = true when the user is a participant', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        participants: [
          { userId: 'user-1', user: { id: 'user-1' } },
          { userId: 'user-2', user: { id: 'user-2' } },
        ],
      });

      const result = await service.findOne('e1', 'user-2');

      expect(result.isJoined).toBe(true);
      // flattened back to plain users for the response contract
      expect(result.participants).toEqual([{ id: 'user-1' }, { id: 'user-2' }]);
    });
  });

  describe('joinEvent', () => {
    it('throws NotFound when the event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.joinEvent('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.eventParticipant.createMany).not.toHaveBeenCalled();
    });

    it('rejects a user who already joined, via the composite-PK conflict', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1' });
      // skipDuplicates -> 0 rows affected means the PK already existed
      prisma.eventParticipant.createMany.mockResolvedValue({ count: 0 });

      await expect(service.joinEvent('e1', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.joinEvent('e1', 'user-1')).rejects.toThrow(
        'You are already a participant',
      );
      expect(prisma.event.updateMany).not.toHaveBeenCalled();
    });

    it('rejects joining a full event, rolling back the membership insert', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1' });
      prisma.eventParticipant.createMany.mockResolvedValue({ count: 1 });
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.joinEvent('e1', 'user-1')).rejects.toThrow(
        'Event is full',
      );
    });

    it('claims membership via the composite PK, then a guarded conditional increment', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'e1' });
      prisma.eventParticipant.createMany.mockResolvedValue({ count: 1 });
      prisma.event.updateMany.mockResolvedValue({ count: 1 });
      prisma.event.findUniqueOrThrow.mockResolvedValue({
        id: 'e1',
        _count: { participants: 4 },
      });

      await service.joinEvent('e1', 'user-1');

      expect(prisma.eventParticipant.createMany).toHaveBeenCalledWith({
        data: [{ eventId: 'e1', userId: 'user-1' }],
        skipDuplicates: true,
      });

      const incrementArg = prisma.event.updateMany.mock.calls[0][0];
      expect(incrementArg.data).toEqual({ seatsTaken: { increment: 1 } });
      expect(incrementArg.where.id).toBe('e1');
      expect(incrementArg.where.OR).toEqual([
        { capacity: null },
        { seatsTaken: { lt: 'capacity' } },
      ]);

      expect(prisma.event.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'e1' },
        include: { _count: { select: { participants: true } } },
      });

      // and an event.user-joined outbox row, same transaction
      const outboxArg = prisma.outboxEvent.create.mock.calls[0][0];
      expect(outboxArg.data.topic).toBe('event.user-joined');
      expect(outboxArg.data.key).toBe('e1');
      expect(outboxArg.data.payload).toMatchObject({ eventId: 'e1', userId: 'user-1' });
    });
  });

  describe('leaveEvent', () => {
    it('locks the event row, deletes the EventParticipant row, then decrements the seat count', async () => {
      prisma.event.findUnique.mockResolvedValue({ authorId: 'organizer' });
      prisma.eventParticipant.deleteMany.mockResolvedValue({ count: 1 });
      prisma.event.findUniqueOrThrow.mockResolvedValue({
        id: 'e1',
        _count: { participants: 3 },
      });

      await service.leaveEvent('e1', 'user-1');

      // the row lock, then the guarded decrement — membership itself goes
      // through the Prisma Client API (composite PK), never raw SQL
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(prisma.eventParticipant.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'e1', userId: 'user-1' },
      });
      expect(prisma.event.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'e1' },
        include: { _count: { select: { participants: true } } },
      });

      const outboxArg = prisma.outboxEvent.create.mock.calls[0][0];
      expect(outboxArg.data.topic).toBe('event.user-left');
      expect(outboxArg.data.key).toBe('e1');
      expect(outboxArg.data.payload).toMatchObject({ eventId: 'e1', userId: 'user-1' });
    });

    it('throws NotFound when the event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.leaveEvent('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.eventParticipant.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects the organizer trying to leave their own event', async () => {
      prisma.event.findUnique.mockResolvedValue({ authorId: 'user-1' });

      await expect(service.leaveEvent('e1', 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.leaveEvent('e1', 'user-1')).rejects.toThrow(
        'The organizer cannot leave their own event',
      );
      expect(prisma.eventParticipant.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects when the user is not a participant of an existing event', async () => {
      prisma.event.findUnique.mockResolvedValue({ authorId: 'organizer' });
      prisma.eventParticipant.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.leaveEvent('e1', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.leaveEvent('e1', 'user-1')).rejects.toThrow(
        'You are not a participant of this event',
      );
      // seat count untouched: only the row lock ran (once per call), no
      // second raw UPDATE since deleteMany affected 0 rows
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('findMyCalendar', () => {
    it('marks every returned event as joined and flags the ones the user organises', async () => {
      prisma.event.findMany.mockResolvedValue([
        { id: 'a', authorId: 'user-1' },
        { id: 'b', authorId: 'someone-else' },
      ]);

      const result = await service.findMyCalendar('user-1');

      expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({
        OR: [
          { authorId: 'user-1' },
          { participants: { some: { userId: 'user-1' } } },
        ],
      });
      expect(result).toEqual([
        { id: 'a', authorId: 'user-1', isJoined: true, isOrganizer: true },
        { id: 'b', authorId: 'someone-else', isJoined: true, isOrganizer: false },
      ]);
    });
  });

  describe('remove', () => {
    it('forbids deleting an event owned by someone else', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        authorId: 'owner',
        participants: [],
      });

      await expect(service.remove('e1', 'intruder')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it('deletes an event owned by the caller', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        authorId: 'owner',
        participants: [],
      });
      prisma.event.delete.mockResolvedValue({ id: 'e1' });

      await service.remove('e1', 'owner');

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });

      const outboxArg = prisma.outboxEvent.create.mock.calls[0][0];
      expect(outboxArg.data.topic).toBe('event.deleted');
      expect(outboxArg.data.key).toBe('e1');
      expect(outboxArg.data.payload).toMatchObject({ eventId: 'e1', deletedBy: 'owner' });
    });
  });

  describe('update', () => {
    const existing = {
      id: 'e1',
      authorId: 'owner',
      participants: [{ id: 'owner' }],
    };

    it('forbids editing an event owned by someone else', async () => {
      prisma.event.findUnique.mockResolvedValue(existing);

      await expect(
        service.update('e1', 'intruder', { title: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects moving an event into the past', async () => {
      prisma.event.findUnique.mockResolvedValue(existing);

      await expect(
        service.update('e1', 'owner', { date: '2000-01-01T00:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('applies the allowed field updates', async () => {
      prisma.event.findUnique.mockResolvedValue(existing);
      prisma.event.update.mockResolvedValue({ id: 'e1' });

      const date = futureDateIso();
      await service.update('e1', 'owner', {
        title: 'Renamed',
        capacity: 42,
        date,
      });

      const arg = prisma.event.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'e1' });
      expect(arg.data.title).toBe('Renamed');
      expect(arg.data.capacity).toBe(42);
      expect(arg.data.date).toBe(new Date(date).toISOString());
    });
  });
});
