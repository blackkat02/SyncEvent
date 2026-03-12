import * as yup from 'yup';

export enum EventVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE'
}

export const createEventSchema = yup.object({
  title: yup.string().required('Title is required'),
  description: yup.string().optional(),
  date: yup.date().required('Date is required'),
  location: yup.string().required('Location is required'),
  capacity: yup.number()
    .transform((value: any) => {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    })
    .positive('Capacity must be positive')
    .integer('Capacity must be an integer')
    .nullable()
    .optional(),
  visibility: yup.mixed<EventVisibility>().oneOf(Object.values(EventVisibility)).required(),
});

export const updateEventSchema = createEventSchema.clone().partial();

export type CreateEventInput = yup.InferType<typeof createEventSchema>;
export type UpdateEventInput = yup.InferType<typeof updateEventSchema>;