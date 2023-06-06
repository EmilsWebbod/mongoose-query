import mongoose from 'mongoose';
import { toValidTextRegexp } from '../QueryOptions.js';
import { IMongooseQueryOptions, QueryValidateFn } from './types.js';

const VALUE_SPLIT = /,|\s/;
const POPULATE_SPLIT = ';';
const POPULATE_PATH_SPLIT = ':';

export const toValidNumber = (
  v: string | number | undefined,
  defaultV: number
) => (typeof v === 'number' ? Number(v) : v ? parseInt(v, 10) : defaultV);

export function mongooseQueryOptions(query: IMongooseQueryOptions) {
  const { skip, limit, page } = mongooseQuerySkipLimit(query);
  const { select, sort } = mongooseQuerySortSelect(query);
  const populate = mongooseQueryPopulate(query);

  return {
    limit,
    skip,
    sort,
    select,
    populate,
    page,
  };
}

export function mongooseQuerySkipLimit(query: IMongooseQueryOptions) {
  try {
    let skip: undefined | number = 0;
    let limit: undefined | number = 20;
    let page: undefined | number;

    if ('skip' in query) {
      skip = toValidNumber(query.skip, 0);
      delete query.skip;
    }
    if ('limit' in query) {
      limit = toValidNumber(query.limit, limit);
      delete query.limit;
    }
    if ('page' in query) {
      const _page = toValidNumber(query.page, 0);
      if (_page === 0) {
        skip = undefined;
        limit = undefined;
      } else {
        skip = limit * (_page - 1);
        page = _page;
      }
      delete query.page;
    }

    return { skip, limit, page };
  } catch (e) {
    return { skip: 0, limit: 20 };
  }
}

export function mongooseQuerySortSelect(query: IMongooseQueryOptions) {
  try {
    let sort = [];
    let select = [];

    if ('sort' in query && query.sort) {
      sort = query.sort.split(VALUE_SPLIT).filter(Boolean);
      delete query.sort;
    }
    if ('select' in query && query.select) {
      select = query.select.split(VALUE_SPLIT).filter(Boolean);
      delete query.select;
    }
    return { sort, select };
  } catch (e) {
    return { sort: [], select: [] };
  }
}

export function mongooseQueryPopulate(query: IMongooseQueryOptions) {
  try {
    const populate = [];
    if ('$populate' in query || 'populate' in query) {
      const populateValue = String(query.populate || query.$populate || '');
      if (populateValue) {
        const pathsToPopulate = populateValue
          .split(POPULATE_SPLIT)
          .filter(Boolean);
        for (const pathToPopulate of pathsToPopulate) {
          const [path, selects] = pathToPopulate.split(POPULATE_PATH_SPLIT);
          if (path) {
            populate.push({
              path,
              ...(selects ? { select: selects.split(VALUE_SPLIT) } : {}),
            });
          }
        }
      }
      delete query.populate;
      delete query.$populate;
    }
    return populate;
  } catch (e) {
    return [];
  }
}

const splitKey = <Q extends mongoose.FilterQuery<any>, K extends keyof Q>(
  key: K
): [operation: string, field: K] => {
  const [operation, ...field] = String(key).split('_');
  return [operation, field.join('_') as K];
};

export function mongooseQueryWithOperation<
  T extends object,
  Q extends mongoose.FilterQuery<T>,
  K extends keyof Q
>(query: Q, queryKey: K, queryValue: string) {
  try {
    const _key = String(queryKey);
    if (_key.match(/^\$gte?_/) || _key.match(/^\$lte?_/)) {
      const [operation, field] = splitKey<Q, K>(_key as K);
      return greaterLessThanValue<T, Q, K>(query, operation, field, queryValue);
    } else if (_key.match(/^\$n?in_/)) {
      const [operation, field] = splitKey<Q, K>(_key as K);
      return toMongooseOperation<T, Q, K>(query, operation, field, queryValue);
    } else {
      const field = _key.slice(1) as K;
      return {
        field,
        value: {
          $regex: new RegExp(toValidTextRegexp(queryValue), 'i'),
        } as Q[K],
      };
    }
  } catch (e) {
    return { field: '', value: '' };
  }
}

export function greaterLessThanValue<
  T extends object,
  Q extends mongoose.FilterQuery<T>,
  K extends keyof Q
>(
  query: Q,
  operation: string,
  field: K,
  queryValue: string
): {
  field: K;
  value: Q[K];
} {
  let value: Q[K];
  if (query[field]) {
    value = {
      ...query[field],
      [operation]: new Date(queryValue),
    };
  } else {
    value = { [operation]: new Date(queryValue) } as Q[K];
  }
  return { field, value };
}

const SORT_SPLIT = /,|\s/;

export function toMongooseOperation<
  T extends object,
  Q extends mongoose.FilterQuery<T>,
  K extends keyof Q
>(
  query: Q,
  operation: string,
  field: K,
  queryValue: string
): {
  field: K;
  value: Q[K];
} {
  const value = {
    [operation]: queryValue.split(SORT_SPLIT),
  } as Q[K];
  return { field, value };
}
