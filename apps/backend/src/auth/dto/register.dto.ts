import { ApiProperty } from '@nestjs/swagger';
import * as yup from 'yup';

export const registerSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup
    .string()
    .min(6, 'Password too short')
    .required('Password is required'),
});

export class RegisterDto implements yup.InferType<typeof registerSchema> {
  @ApiProperty({ example: 'user@example.com', description: 'User email' })
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'User password (min 6 chars)',
  })
  password: string;
}
