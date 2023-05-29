import mongoose from 'mongoose';

export type MongooseSortSelectValue<
  T extends object,
  K extends keyof T = keyof T
> = K extends string ? `-${K}` | K : keyof T;

export type QueryType<T extends object> = mongoose.FilterQuery<T>;

export type IQueryAddToModelQuery<R extends object, T extends object> = {
  [key in keyof R]?: QueryType<T>;
};

export interface IQueryOptions {
  score?: { $meta: 'textScore' };
}
