import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
} from '@nestjs/common';
import { RegisterDto, LoginDto, LogoutDto } from './auth.dto';
import { KratosPasswordService } from './kratos-password.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly kratos: KratosPasswordService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.kratos.register(dto.email, dto.password);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.kratos.login(dto.email, dto.password);
  }

  @Get('whoami')
  whoami(@Headers('x-session-token') sessionToken?: string) {
    if (!sessionToken) {
      throw new BadRequestException('x-session-token header is required');
    }
    return this.kratos.whoAmI(sessionToken);
  }

  @Post('logout')
  async logout(@Body() dto: LogoutDto) {
    await this.kratos.logout(dto.sessionToken);
    return { revoked: true };
  }
}
