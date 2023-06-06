import mongoose from 'mongoose';

export type MongooseSortSelectValue<
  T extends object,
  K extends keyof T = keyof T
> = K extends string ? `-${K}` | K : keyof T;

export type QueryType<T extends object> = mongoose.FilterQuery<T>;

export type QueryActions = 'create' | 'query' | 'update' | 'updateMany';
export type QueryValidateFn = (query: any) => any;

export type IQueryAddToModelQuery<R extends object, T extends object> = {
  [key in keyof R]?: QueryType<T>;
};

export interface IQueryOptions {
  score?: { $meta: 'textScore' };
}

export interface IMongooseQueryOptions {
  skip?: number | string;
  limit?: number | string;
  page?: number | string;

  /** @deprecated. Use $text */
  text?: string;
  $text?: string;

  sort?: string;
  select?: string;
  /** @deprecated. Use $populate */
  populate?: string;
  $populate?: string;

  [key: string | number | symbol]: string | number | undefined;
}
