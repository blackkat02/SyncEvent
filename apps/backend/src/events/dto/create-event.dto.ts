import { ApiProperty } from '@nestjs/swagger';
import { Visibility } from '@prisma/client';
import * as yup from 'yup';

const eventSchemaShape = {
  title: yup.string().required('Title is required'),
  description: yup.string().optional(),
  date: yup
    .date()
    .min(new Date(), 'Cannot create events in the past')
    .required('Date is required'),
  location: yup.string().required('Location is required'),
  capacity: yup
    .number()
    .transform((value: unknown) => {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    })
    .positive('Capacity must be positive')
    .integer('Capacity must be an integer')
    .nullable()
    .optional(),
  visibility: yup
    .mixed<Visibility>()
    .oneOf(Object.values(Visibility))
    .required(),
};

export const createEventSchema = yup.object().shape(eventSchemaShape);

export class CreateEventDto implements yup.InferType<typeof createEventSchema> {
  @ApiProperty({ example: 'Tech Conference 2026' })
  title: string;

  @ApiProperty({ example: 'Description...', required: false })
  description?: string;

  @ApiProperty({ example: '2026-11-15T09:00:00Z' })
  date: any;

  @ApiProperty({ example: 'Kyiv, Ukraine' })
  location: string;

  @ApiProperty({ example: 500, required: false })
  capacity?: number;

  @ApiProperty({
    enum: Visibility,
    default: Visibility.PUBLIC,
  })
  visibility: Visibility;
}
