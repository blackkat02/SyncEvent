import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import * as yup from 'yup';

@Injectable()
export class YupValidationPipe implements PipeTransform {
  constructor(private schema: yup.AnyObjectSchema) {}

  async transform(value: unknown): Promise<unknown> {
    try {
      const validatedValue = (await this.schema.validate(value, {
        abortEarly: false,
        stripUnknown: true,
      })) as Record<string, unknown>;

      return validatedValue;
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      throw new BadRequestException('Invalid request data');
    }
  }
}
