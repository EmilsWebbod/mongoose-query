import mongoose from 'mongoose';
import mongoSanitize from 'express-mongo-sanitize';
import { IQueryPopulate } from './QueryOptions.js';
import {
  mongooseQueryOptions,
  mongooseQueryWithOperation,
} from './utils/Query.utils.js';
import {
  IMongooseQueryOptions,
  IQueryAddToModelQuery,
  IQueryOptions,
  MongooseSortSelectValue,
  QueryType,
} from './utils/types.js';

export class Query<
  R extends object,
  T extends object = object,
  Q extends IMongooseQueryOptions = IMongooseQueryOptions
> {
  // Query that always run in an $and operation to not be overridden by query.
  private _root: QueryType<T> | null = null;
  // Query that's only added once to the model query
  private _rootNext: QueryType<T> | null = null;
  // A way to add populations that's not available for the user
  private _rootPopulate: mongoose.PopulateOptions[] = [];
  // This is used to override the query when you always want to fetch specific documents.
  private _or: QueryType<T>[] = [];

  // Used by Express or Koa to set model active to fetch modelQuery
  private _model: keyof R | undefined = undefined;
  // Option to run specific operation for models in mongoose.
  private _addToModelQuery: IQueryAddToModelQuery<R, T> = {};

  // Removed the skip and limit to fetch all documents connected to query.
  private _export: boolean = false;
  // Sets a projection to run on the query.
  private _projection: object | undefined = undefined;

  readonly page: number | undefined;
  private _skip: number | undefined;
  private _limit: number | undefined;
  readonly sort: MongooseSortSelectValue<T>[] = [];
  private _select: MongooseSortSelectValue<T>[] = [];

  private _query: QueryType<T> = {};
  private textQuery: QueryType<T>;
  private documentQuery: Q;
  readonly hasTextSearch: boolean = false;
  readonly options: IQueryOptions = {};
  readonly populate: IQueryPopulate[] = [];

  constructor(queries: Q) {
    const query: Q = Object.assign({}, queries);
    const { limit, skip, sort, select, populate, page } =
      mongooseQueryOptions(query);
    this._limit = limit;
    this._skip = skip;
    this.sort = sort;
    this._select = select;
    this.populate = populate;
    this.page = page;

    this.textQuery = this.mongooseTextSearch(query);
    if (this.textQuery) {
      this.hasTextSearch = true;
    }

    this.documentQuery = query;
  }

  get skip() {
    return this._skip;
  }

  get limit() {
    return this._limit;
  }

  get root(): QueryType<T> | null {
    const root = this._root;
    if (this._model && this._addToModelQuery[this._model]) {
      if (root) {
        return {
          $and: [root, this._addToModelQuery[this._model]!],
        } as QueryType<T>;
      }
      return this._addToModelQuery[this._model]!;
    }
    return root;
  }

  get model() {
    return this._model;
  }

  set model(value: keyof R) {
    this._model = value;
  }

  get rootPopulate() {
    return this._rootPopulate;
  }

  get select() {
    return this._select;
  }

  get or() {
    return this._or;
  }

  get query() {
    return this.documentQuery;
  }

  get export() {
    return this._export;
  }

  set export(value: boolean) {
    this._export = value;
  }

  get projection() {
    return this._projection;
  }

  set projection(value: object | undefined) {
    this._projection = value;
  }

  public setSkipAndLimit(skip: number | undefined, limit: number | undefined) {
    this._skip = skip;
    this._limit = limit;
  }

  public setQuery<K extends keyof QueryType<T>>(
    key: K,
    value: QueryType<T>[K]
  ) {
    this._query[key] = value;
  }

  public addOr(query: QueryType<T>) {
    this._or.push(query);
  }

  public defaultSelect(select: MongooseSortSelectValue<T>[]) {
    if (this._select.length !== 0) return;
    this._select = select;
  }

  public addPopulate(
    populate: mongoose.PopulateOptions | mongoose.PopulateOptions[]
  ) {
    this._rootPopulate.push(
      ...(Array.isArray(populate) ? populate : [populate])
    );
  }

  public addRoot(query: QueryType<T>) {
    this._root = {
      ...(this._root || {}),
      ...query,
    };

    return this._root;
  }

  public addRootNext(query: QueryType<T>) {
    this._rootNext = {
      ...(this._rootNext || {}),
      ...query,
    };

    return this._rootNext;
  }

  public removeQuery(key: keyof QueryType<T>) {
    return this.deleteKeysFromQuery(key);
  }
  public deleteKeysFromQuery(key: keyof QueryType<T>) {
    if (key in this._query) {
      delete this._query[key];
    }
    if (key in this.documentQuery) {
      // @ts-ignore
      delete this.documentQuery[key];
    }
  }

  public deleteKeysFromRoot(keys: (keyof QueryType<T>)[]) {
    if (this._root) {
      for (const key of keys) {
        // @ts-ignore
        if (key in this._root) {
          delete this._root[key];
        }
      }
    }
  }

  public getModelQuery<TT extends object>(key: string): QueryType<TT> {
    return this._addToModelQuery[key];
  }

  public addToModelQuery<
    TT extends { [key: string]: object },
    K extends keyof TT = keyof TT
  >(model: K | K[], query: QueryType<TT[K]>) {
    const modelKeys = model as unknown as keyof R[];
    const keys = Array.isArray(modelKeys)
      ? modelKeys
      : ([modelKeys] as (keyof R)[]);
    for (const modelKey of keys) {
      if (this._addToModelQuery[modelKey]) {
        // @ts-ignore
        this._addToModelQuery[modelKey] = {
          ...this._addToModelQuery[modelKey],
          ...query,
        };
      } else {
        // @ts-ignore
        this._addToModelQuery[modelKey] = { ...query };
      }
    }
    return this;
  }

  public removeFromModelQuery(model: string, key: string) {
    if (this._addToModelQuery[model]) {
      if (key in this._addToModelQuery[model]) {
        delete this._addToModelQuery[model][key];
      }
    }
    return this;
  }

  public createQuery({
    query,
    noRoot,
  }: ICreateQueryOptions<R, T> = {}): QueryType<T> {
    const _query = this.initQuery();
    const queryArray = [];
    const root = this.root;
    if (!noRoot && root && Object.keys(root).length > 0) {
      queryArray.push(root);
    }
    if (!noRoot && this._rootNext && Object.keys(this._rootNext).length > 0) {
      queryArray.push(this._rootNext);
      this._rootNext = null;
    }
    if (Object.keys(_query).length > 0) {
      const addQuery = query
        ? query.reduce((obj, key) => {
            if (typeof _query[key] !== 'undefined') {
              obj[key] = _query[key];
            }
            return obj;
          }, {} as QueryType<T>)
        : _query;
      if (Object.keys(addQuery).length > 0) {
        queryArray.push(addQuery);
      }
    }

    const mQuery =
      queryArray.length > 1 ? { $and: queryArray } : queryArray[0] || {};

    if (this._or.length > 0) {
      return {
        $or: [...this._or, mQuery],
      } as QueryType<T>;
    }

    return (mQuery as QueryType<T>) || {};
  }

  private initQuery(): QueryType<T> {
    const query: Q = Object.assign({}, this.documentQuery);

    const operations = this.mongooseQueryWithOperations(query);
    const sanitized = this.sanitizedQuery(query);

    return { ...operations, ...sanitized, ...this.textQuery, ...this._query };
  }

  private mongooseTextSearch(query: Q | (Q & { text: unknown })) {
    const _query = {};
    if ('$text' in query) {
      if (query.$text) {
        _query['$text'] = { $search: query.$text };
        this.options['score'] = { $meta: 'textScore' };
      }
      delete query.$text;
    }
    return _query;
  }

  private mongooseQueryWithOperations(query: Q) {
    const operationQuery: QueryType<T> = {};
    for (const key in query) {
      if (query.hasOwnProperty(key)) {
        const str = String(query[key]);
        if (!str) continue;
        if (key[0] === '$') {
          if (typeof query[key] !== 'string') continue;
          const { field, value } = mongooseQueryWithOperation(
            operationQuery,
            key,
            str
          );
          if (field && value) {
            operationQuery[field] = value;
          }
          delete query[key];
        } else if (key[0] === '!') {
          const field = key.slice(1) as keyof QueryType<T>;
          operationQuery[field] = { $ne: str };
          delete query[key];
        }
      }
    }
    return operationQuery;
  }

  private sanitizedQuery(query: Q) {
    const cleanedQuery: QueryType<T> = {};
    for (const key in query) {
      if (query.hasOwnProperty(key)) {
        if (typeof query[key] !== 'string' || query[key] !== '') {
          // @ts-ignore
          cleanedQuery[key] = query[key];
        }
      }
    }
    return mongoSanitize.sanitize(cleanedQuery, { replaceWith: '_' });
  }
}

interface ICreateQueryOptions<R, T extends object> {
  query?: (keyof T)[];
  noRoot?: boolean;
}
