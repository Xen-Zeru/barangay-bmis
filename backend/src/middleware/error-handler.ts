import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';
import { ERROR_CODES, AppError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `No API route matches ${req.method} ${req.originalUrl}.`,
    },
  });
};

interface BodyParserError extends SyntaxError {
  status?: number;
  body?: unknown;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  const bodyParserError = error as BodyParserError;
  if (bodyParserError instanceof SyntaxError && bodyParserError.status === 400) {
    res.status(400).json({
      error: {
        code: ERROR_CODES.INVALID_JSON,
        message: 'The request body is not valid JSON.',
      },
    });
    return;
  }

  console.error('Unhandled API error', error);
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: env.isProduction
        ? 'An unexpected error occurred. Please try again later.'
        : 'An unexpected error occurred. Check the server log for details.',
    },
  });
}
