import mongoose from 'mongoose';
import mongodb from 'mongodb';
import httpStatus from 'http-status';

interface ErrorOpts {
  message?: string;
  detail?: string;
  errors?: Omit<ErrorOpts, 'errors'>[];
  error?: any;
}

export class QueryError<R extends object, C extends string> extends Error {
  readonly status: number;
  readonly detail?: string;
  readonly errors?: ErrorOpts[];

  constructor(
    status: number,
    message: string,
    opts?: Pick<ErrorOpts, 'detail' | 'errors' | 'error'>
  ) {
    super(message);
    this.status = status;
    this.detail = opts?.detail;
    this.errors = opts?.errors;
  }

  static catch<R extends object, C extends string>(
    e: Error | QueryError<R, C>
  ): QueryError<R, C> {
    if (e instanceof QueryError) {
      return e;
    }
    const [status, { message, ...opts }] = QueryError.getData(e);
    console.error(e);
    return new QueryError<R, C>(status, message, opts);
  }

  static getData(error: mongoose.Error): [number, ErrorOpts] {
    if (error instanceof mongodb.MongoServerError) {
      if (error.code === 11000) {
        return [
          httpStatus.CONFLICT,
          {
            message: 'Duplicate document',
            detail: error.message,
          },
        ];
      }
      return [
        httpStatus.INTERNAL_SERVER_ERROR,
        {
          message: 'Database error',
          detail: error.message,
        },
      ];
    }
    if (error instanceof mongoose.Error.ValidationError) {
      const opts: Partial<ErrorOpts> = {
        error,
      };
      if (error.errors && Object.keys(error.errors).length > 0) {
        opts.errors = Object.values(error.errors).map((x) => ({
          title: x.message,
          error: x,
        }));
      }
      return [httpStatus.BAD_REQUEST, opts];
    }
    return [httpStatus.INTERNAL_SERVER_ERROR, {}];
  }
}
