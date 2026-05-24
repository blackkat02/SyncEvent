// apps/shared/src/schemas/event.schema.ts
import * as yup from 'yup';

export enum EventVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE'
}

export const createEventSchema = yup.object({
  title: yup.string().required('Title is required').min(2, 'Too short'),
  description: yup.string().optional().nullable(),
  location: yup.string().required('Location is required'),
  capacity: yup.number()
    .transform((value: any) => (Number.isNaN(Number(value)) || value === '' ? null : Number(value)))
    .positive('Capacity must be positive')
    .integer('Capacity must be an integer')
    .nullable()
    .optional(),
  visibility: yup.mixed<EventVisibility>().oneOf(Object.values(EventVisibility)).required(),

  // ✅ Додаємо ці поля в схему, щоб InferType автоматично вивів їх для форми
  dateStr: yup.string().required('Date is required'),
  timeStr: yup.string().required('Time is required'),
  date: yup.mixed().optional(), // залишаємо як опціональний бек-енд маркер
});

export type CreateEventInput = yup.InferType<typeof createEventSchema>;