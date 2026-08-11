import {
  Catch,
  ArgumentsHost,
  HttpException,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Sentry from '@sentry/nestjs';

const EXPECTED_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422, 429]);

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = 500;
    let res: string | object = { message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      res = exception.getResponse();
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    const logPath = path.join(__dirname, '..', 'debug.log');
    fs.appendFileSync(
      logPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        status,
        res,
      }) + '\n',
    );

    const shouldCapture = !EXPECTED_STATUS_CODES.has(status);

    if (shouldCapture) {
      Sentry.withScope((scope) => {
        scope.setTag('http.status', status);
        scope.setTag('http.method', request.method);
        scope.setTag('http.route', request.url);
        scope.setTag('environment', process.env.NODE_ENV ?? 'development');

        const userId = request.user?.id;
        if (userId) {
          scope.setUser({ id: userId });
        }

        const safeHeaders = { ...request.headers };
        delete safeHeaders['authorization'];
        delete safeHeaders['cookie'];
        scope.setContext('request', {
          method: request.method,
          url: request.url,
          headers: safeHeaders,
        });

        if (request.body && typeof request.body === 'object') {
          const safeBody = { ...request.body };
          delete safeBody['password'];
          delete safeBody['otp'];
          delete safeBody['token'];
          delete safeBody['accessToken'];
          delete safeBody['refreshToken'];
          scope.setContext('request_body', safeBody);
        }

        Sentry.captureException(exception);
      });
    }

    response.status(status).json(res);
  }
}