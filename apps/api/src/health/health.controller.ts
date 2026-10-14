import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Publico } from '../auth/auth.guard';

export interface HealthStatus {
  status: 'ok';
  uptimeSeconds: number;
}

@ApiTags('saúde')
@Publico()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'A API está no ar.' })
  check(): HealthStatus {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
