/* eslint-disable prettier/prettier */
import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import * as yup from 'yup';

@Injectable()
export class YupValidationPipe implements PipeTransform {
  constructor(private schema: yup.AnyObjectSchema) { }

  async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    if (metadata.type !== 'body') {
      return value;
    }

    try {
      return await this.schema.validate(value, {
        abortEarly: false,
        stripUnknown: true,
      });
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        const formattedErrors = error.inner.reduce(
          (acc, err) => {
            if (err.path) acc[err.path] = err.message;
            return acc;
          },
          {} as Record<string, string>,
        );

        throw new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: formattedErrors,
        });
      }
      throw new BadRequestException('Invalid request data');
    }
  }
}
