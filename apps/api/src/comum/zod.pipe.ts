import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Valida e converte corpo ou query com um esquema zod; erro 400 com os campos. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<
  unknown,
  z.infer<S>
> {
  constructor(private readonly schema: S) {}

  transform(valor: unknown): z.infer<S> {
    const resultado = this.schema.safeParse(valor ?? {});
    if (!resultado.success) {
      throw new BadRequestException({
        message: 'Requisição inválida',
        campos: resultado.error.issues.map((issue) => ({
          campo: issue.path.join('.'),
          problema: issue.message,
        })),
      });
    }
    return resultado.data;
  }
}
