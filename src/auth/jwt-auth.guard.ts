import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err) {
      const response = err.response;
      if (response && response.code) {
        throw new UnauthorizedException(response);
      }
      throw err;
    }
    if (!user) {
      throw new UnauthorizedException({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Authentication token is invalid or expired.',
      });
    }
    return user;
  }
}