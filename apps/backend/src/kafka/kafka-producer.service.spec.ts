import { of, throwError } from 'rxjs';
import { KafkaProducerService } from './kafka-producer.service';

/**
 * Unit tests for {@link KafkaProducerService}. The injected `ClientKafka` is
 * mocked down to `emit`/`connect`/`close`; `emit` returns an rxjs Observable
 * like the real client.
 */
describe('KafkaProducerService', () => {
  let client: { emit: jest.Mock; connect: jest.Mock; close: jest.Mock };
  let service: KafkaProducerService;

  beforeEach(() => {
    client = {
      emit: jest.fn().mockReturnValue(of({})),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    service = new KafkaProducerService(client as never);
  });

  it('wraps the payload with a partition key when one is given', async () => {
    await service.emit('event.user-joined', { eventId: 'e1' }, 'e1');

    expect(client.emit).toHaveBeenCalledWith('event.user-joined', {
      key: 'e1',
      value: { eventId: 'e1' },
    });
  });

  it('sends value-only when no key is given', async () => {
    await service.emit('event.created', { eventId: 'e1' });

    expect(client.emit).toHaveBeenCalledWith('event.created', {
      value: { eventId: 'e1' },
    });
  });

  it('rejects when the broker errors, so the relay will not stamp sentAt', async () => {
    client.emit.mockReturnValue(throwError(() => new Error('broker down')));

    await expect(
      service.emit('event.user-joined', { eventId: 'e1' }, 'e1'),
    ).rejects.toThrow('broker down');
  });

  it('does not throw from onModuleInit when the broker is cold', async () => {
    client.connect.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
