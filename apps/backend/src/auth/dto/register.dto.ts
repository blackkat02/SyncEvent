import { ApiProperty } from '@nestjs/swagger';
import { RegisterInput } from '@syncevent/shared';

export class RegisterDto implements RegisterInput {
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'password123' })
  password: string;
}
