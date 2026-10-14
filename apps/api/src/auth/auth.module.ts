import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JoseVerificador } from './jose-verificador';
import { PostgresUsuariosRepositorio } from './postgres-usuarios.repositorio';
import { Tokens } from './tokens';
import { UsuariosRepositorio } from './usuarios.repositorio';
import { VerificadorIdentidade } from './verificador-identidade';

@Module({
  controllers: [AuthController],
  providers: [
    Tokens,
    AuthService,
    { provide: UsuariosRepositorio, useClass: PostgresUsuariosRepositorio },
    {
      provide: VerificadorIdentidade,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        JoseVerificador.daConfig(config),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
