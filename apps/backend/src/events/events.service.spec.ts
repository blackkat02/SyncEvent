import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Visibility } from '@prisma/client';
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
  count: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

type PrismaMock = {
  event: PrismaEventMock;
  $transaction: jest.Mock;
};

const createPrismaMock = (): PrismaMock => {
  const event: PrismaEventMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const $transaction = jest.fn((arg: unknown) => {
    // Callback form: prisma.$transaction(async (tx) => { ... })
    if (typeof arg === 'function') {
      return (arg as (tx: { event: PrismaEventMock }) => unknown)({ event });
    }
    // Array form: prisma.$transaction([p1, p2])
    return Promise.all(arg as Promise<unknown>[]);
  });

  return { event, $transaction };
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
      const created = { id: 'event-1', ...dto };
      prisma.event.create.mockResolvedValue(created);

      const result = await service.create(dto, 'user-1');

      expect(result).toBe(created);
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      const arg = prisma.event.create.mock.calls[0][0];
      expect(arg.data.authorId).toBe('user-1');
      expect(arg.data.date).toBeInstanceOf(Date);
      expect(arg.data.date.toISOString()).toBe(dto.date);
      expect(arg.data.participants).toEqual({ connect: { id: 'user-1' } });
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
        { id: 'a', participants: [{ id: 'user-1' }] },
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
        participants: [{ id: 'user-1' }],
      });

      const result = await service.findOne('e1');

      expect(result.isJoined).toBe(false);
    });

    it('reports isJoined = true when the user is a participant', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        participants: [{ id: 'user-1' }, { id: 'user-2' }],
      });

      const result = await service.findOne('e1', 'user-2');

      expect(result.isJoined).toBe(true);
    });
  });

  describe('joinEvent', () => {
    it('throws when the event does not exist', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.joinEvent('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a user who already joined', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        participants: [{ id: 'user-1' }],
        _count: { participants: 1 },
      });

      await expect(service.joinEvent('e1', 'user-1')).rejects.toThrow(
        'You are already a participant',
      );
    });

    it('rejects joining a full event', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        participants: [],
        capacity: 2,
        _count: { participants: 2 },
      });

      await expect(service.joinEvent('e1', 'user-1')).rejects.toThrow(
        'Event is full',
      );
    });

    it('connects the user when there is room', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        participants: [],
        capacity: 10,
        _count: { participants: 3 },
      });
      prisma.event.update.mockResolvedValue({ id: 'e1' });

      await service.joinEvent('e1', 'user-1');

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { participants: { connect: { id: 'user-1' } } },
      });
    });

    it('retries on a serialization conflict and then succeeds', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError(
        'write conflict',
        { code: 'P2034', clientVersion: 'test' },
      );

      prisma.$transaction
        .mockRejectedValueOnce(conflict)
        .mockImplementationOnce((cb: (tx: unknown) => unknown) => {
          prisma.event.findUnique.mockResolvedValue({
            id: 'e1',
            participants: [],
            _count: { participants: 0 },
          });
          prisma.event.update.mockResolvedValue({ id: 'e1' });
          return cb({ event: prisma.event });
        });

      const result = await service.joinEvent('e1', 'user-1');

      expect(result).toEqual({ id: 'e1' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('gives up after exhausting retries', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError(
        'write conflict',
        { code: 'P2034', clientVersion: 'test' },
      );
      prisma.$transaction.mockRejectedValue(conflict);

      await expect(service.joinEvent('e1', 'user-1')).rejects.toBe(conflict);
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });
  });

  describe('leaveEvent', () => {
    it('disconnects the user from the event', async () => {
      prisma.event.update.mockResolvedValue({ id: 'e1' });

      await service.leaveEvent('e1', 'user-1');

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { participants: { disconnect: { id: 'user-1' } } },
      });
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
          { participants: { some: { id: 'user-1' } } },
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
