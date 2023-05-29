import mongoose from 'mongoose';
import { Query } from './Query.js';
import { DEFAULT_LIMIT } from './utils/constants.js';

export interface IQueryOptionsPopulate<T extends any, K extends keyof T> {
  path: K;
  select: (T[K] extends object ? keyof T[K] : string)[];
  ref?: string;
  lookupRef?: string;
  onFindOne?: boolean;
  onPatch?: boolean;
  onPost?: boolean;
  onAll?: boolean;
  onSearch?: boolean;
  populate?: mongoose.PopulateOptions[];
}

interface IQuerySearchOptionsSub<T extends object, K extends keyof T> {
  sub: K;
  populate: IQueryOptionsPopulate<T[K], keyof T[K]>[];
}

interface IQueryOptions<T extends object> {
  editFields?: (keyof T)[];
  privateFields?: (keyof T)[];
  query?: (keyof T)[];
  select?: (keyof T)[];
  defaultSelect?: (keyof T)[] | string[];
  sort?: (keyof T)[];
  populate?: IQueryOptionsPopulate<T, keyof T>[];
  limit?: number;
  subs?: IQuerySearchOptionsSub<T, keyof T>[];
  updateDateKey?: keyof T;
}

export interface IQueryPopulate {
  path: string;
  select?: string[];
}

type IModelQuery = mongoose.QueryWithHelpers<unknown, unknown>;
export const toValidSelectRegexp = (select: string | number | symbol) =>
  new RegExp(`^${String(select)}(\..|$)`);
export const toValidSortRegexp = (sort: string | number | symbol) =>
  new RegExp(`^(\\+|-)?(${String(sort)}|text)$`);
export const toValidTextRegexp = (str: string) =>
  typeof str === 'string'
    ? new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : '';

export class QueryOptions<T extends object> {
  constructor(private opts: IQueryOptions<T> = {}) {}

  public get publicFields() {
    return this.opts.editFields;
  }

  public get privateFields() {
    return this.opts.privateFields;
  }

  public get populate() {
    return this.opts.populate;
  }

  public get subs() {
    return this.opts.subs;
  }

  public get updateDateKey() {
    return this.opts.updateDateKey;
  }

  public get query() {
    return this.opts.query;
  }

  public createSearchQuery(query: Query<any, T>): mongoose.FilterQuery<T> {
    return query.createQuery({ noRoot: false, query: this.opts.query });
  }

  public setPopulate(modelQuery: IModelQuery, query: Query<T>) {
    let populate: mongoose.PopulateOptions[] = [];
    if (query.populate.length > 0 && this.opts.populate) {
      populate = this.getValidPopulate(query.populate).map((x) => ({
        ...x,
        select: x.select.join(' '),
      })) as mongoose.PopulateOptions[];
    }
    if (query.rootPopulate.length > 0) {
      populate.push(...query.rootPopulate);
    }
    if (populate.length > 0) {
      modelQuery.populate(populate);
    }
  }

  public getValidPopulate(
    queryPopulate: IQueryPopulate[],
    sub?: keyof T
  ): IQueryOptionsPopulate<any, any>[] {
    let checkPop = this.opts.populate;
    if (this.opts.subs && sub) {
      const found = this.opts.subs.find((x) => x.sub === sub);
      if (!found || !found.populate || found.populate.length === 0) return [];
      // @ts-ignore
      checkPop = found.populate;
    }
    if (!checkPop) return [];
    return queryPopulate
      .map((pop) => {
        const found = checkPop!.find((x) => x.path === pop.path);
        if (!found) return null;
        const select =
          pop.select?.filter((x) => found.select.includes(x as any)) || [];
        return {
          path: pop.path,
          select: select.length > 0 ? select : found.select,
          ...(found.populate ? { populate: found.populate } : {}),
        };
      })
      .filter(Boolean) as IQueryOptionsPopulate<any, any>[];
  }

  public setLimitAndSkip(modelQuery: IModelQuery, query: Query<T>) {
    if (query.export) return;
    modelQuery.skip(query.skip ?? 0);
    modelQuery.limit(query.limit ?? this.opts.limit ?? DEFAULT_LIMIT);
  }

  public setSelect(
    modelQuery: IModelQuery,
    query: Query<T>,
    overrideValid?: (keyof T)[]
  ) {
    const valids = overrideValid || this.opts.select;
    let selects: (keyof T)[] = valids || [];
    if (valids && valids.length > 0 && query.select.length > 0) {
      selects = query.select.filter((select) =>
        valids.some((valid) => String(select).match(toValidSelectRegexp(valid)))
      );
    } else if (this.opts.defaultSelect) {
      selects = this.opts.defaultSelect as (keyof T)[];
    }

    if (selects.length > 0) {
      modelQuery.select(selects.join(' '));
    }
  }

  public setSort(modelQuery: IModelQuery, query: Query<T>) {
    if (query.sort.length > 0) {
      if (this.opts.sort) {
        const validSorts = query.sort.filter((x) =>
          this.opts.sort!.some((y) => String(x).match(toValidSortRegexp(y)))
        );
        modelQuery.sort(sortArrayToSortObject(validSorts, query.hasTextSearch));
      } else {
        modelQuery.sort(sortArrayToSortObject(query.sort, query.hasTextSearch));
      }
    }
  }

  public setProjection(modelQuery: IModelQuery, query: Query<T>) {
    if (query.projection) {
      modelQuery.projection(query.projection);
      query.projection = undefined;
    }
  }

  public getSubPopulateLookup<K extends keyof T>(query: Query<T>, sub: K) {
    if (!this.opts.subs) return [];
    const validPopulate = this.opts.subs.find((x) => x.sub === sub);
    if (!validPopulate) return [];

    const populate = query.populate;
    const $lookups = [];
    if (populate.length > 0) {
      for (const pop of populate) {
        const found = validPopulate.populate.find((x) => x.path === pop.path);
        if (!found) continue;
        const select = pop.select
          ? found.select.filter((x) => pop.select!.includes(String(x)))
          : found.select;

        $lookups.push(
          ...[
            {
              $lookup: {
                from: found.lookupRef || `${pop.path}s`,
                localField: `${String(sub)}.${pop.path}`,
                foreignField: '_id',
                as: pop.path,
              },
            },
            ...(pop.select
              ? [
                  {
                    $project: {
                      _id: 1,
                      [sub]: 1,
                      count: 1,
                      [pop.path]: select.reduce(
                        (obj, item) => ({ ...obj, [item]: 1 }),
                        {}
                      ),
                    },
                  },
                ]
              : []),
          ]
        );
      }
    }
    return $lookups;
  }

  public getSubFilterConditionAndMatch(
    subQuery: mongoose.FilterQuery<T>,
    sub: keyof T
  ) {
    const cond: any = {};
    let $match: any = {};
    // tslint:disable-next-line:forin
    for (const key in subQuery) {
      const v = subQuery[key];
      if (key !== '$and' && !Array.isArray(v)) {
        const $and: any[] = [];
        const [newItem, toMatch] = queryToSubFilter(key, subQuery[key]);
        if (newItem.length > 0) {
          $and.push(...newItem);
        }
        $match = { ...$match, ...toMatch };
        cond['$and'] = $and;
      }
    }
    const $filter = { input: `$${String(sub)}`, as: 'subdoc', cond };
    return { $filter, $match };
  }
}

interface UpdateObject {
  [key: string]:
    | {
        $in?: string[];
        $nin?: string[];
      }
    | string;
}

function queryToSubFilter<T extends UpdateObject, K extends keyof T>(
  key: K,
  value?: T[K]
): [any[], object] {
  if (!value) return [[], {}];
  if (typeof value === 'object') {
    if ('$in' in value && value.$in) {
      return [
        [{ $in: [`$$subdoc.${String(key)}`, value.$in.map(toCorrectIdValue)] }],
        {},
      ];
    }
    if ('$nin' in value && value.$nin) {
      return [
        value.$nin.map((x) => ({
          $ne: [`$$subdoc.${String(key)}`, toCorrectIdValue(x)],
        })),
        {},
      ];
    }
  }
  return [[], { [key]: toCorrectIdValue(value as string) }];
}

function toCorrectIdValue(v?: string | number) {
  if (!v) return v;
  if (mongoose.isValidObjectId(v)) return new mongoose.Types.ObjectId(v);
  return v;
}

function sortArrayToSortObject(arr: string[], hasText?: boolean) {
  const sortObj: any = {};
  for (const item of arr) {
    if (item === 'text' && hasText) {
      sortObj['score'] = { $meta: 'textScore' };
    } else if (item[0] === '-') {
      sortObj[item.substr(1)] = -1;
    } else if (item[0] === '+') {
      sortObj[item.substr(1)] = 1;
    } else {
      sortObj[item] = 1;
    }
  }
  return sortObj;
}
