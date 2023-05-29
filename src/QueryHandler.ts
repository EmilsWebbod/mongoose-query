import mongoose from 'mongoose';
import { Query } from './Query';
import {
  ModelSearchPopulate,
  QueryModel,
  toValidTextRegexp,
} from './QueryModel';

export interface QueryFindOpts {
  populate?: boolean;
  select?: boolean;
}

type SubDocArray<T extends object, K extends keyof T> = T[K][];
type SubDocItem<T extends object, K extends keyof T> =
  | (T[K] extends [] ? T[K][0] : null)
  | null;

export class QueryHandler<T extends object> {
  constructor(
    private _model: mongoose.Model<T>,
    private queryModel: QueryModel<T>
  ) {
    this.toJSON = this.toJSON.bind(this);
  }

  public get model() {
    return this._model;
  }

  public async create<B extends Partial<T>>(body: B) {
    const newDoc = new this._model(body);
    await newDoc.validate();
    await newDoc.save();
    return newDoc;
  }

  public async json<D extends mongoose.Document>(doc: D): Promise<any> {
    return doc.toJSON({ transform: this.toJSON });
  }

  public async search(query: Query<T>) {
    const findQuery = this.queryModel.createSearchQuery(query);
    const modelFind = this._model.find(findQuery, query.options);
    this.queryModel.setPopulate(modelFind, query);
    this.queryModel.setLimitAndSkip(modelFind, query);
    this.queryModel.setSort(modelFind, query);
    this.queryModel.setSelect(modelFind, query, query.select);

    const { skip = query.skip, limit = query.limit } = modelFind.getOptions();
    const [data, count] = await Promise.all([
      modelFind.lean().exec(),
      this._model.find(findQuery).count(),
    ]);

    return { data: data as T[], count, limit, skip };
  }

  public async findOne(query: Query<T>, opts: QueryFindOpts = {}) {
    const filter = query.root || query.createQuery();
    const modelFindOne = this._model.findOne(filter);
    if (opts.populate) this.queryModel.setPopulate(modelFindOne, query);
    this.queryModel.setSelect(
      modelFindOne,
      query,
      opts.select ? undefined : []
    );
    this.queryModel.setProjection(modelFindOne, query);
    return modelFindOne.exec();
  }

  public async findOneAndUpdate(
    query: Query<T>,
    filter: mongoose.FilterQuery<T>,
    update: mongoose.UpdateQuery<T>
  ) {
    if (this.queryModel.updateDateKey) {
      if ('$set' in update) {
        // @ts-ignore
        update['$set'][this.queryModel.updateDateKey as keyof T] = new Date();
      } else {
        // @ts-ignore
        update[this.queryModel.updateDateKey as keyof T] = new Date();
      }
    }
    const modelUpdateOne = this._model.findOneAndUpdate(filter, update, {
      new: true,
    });
    this.queryModel.setPopulate(modelUpdateOne, query);
    this.queryModel.setSelect(modelUpdateOne, query);
    return modelUpdateOne.exec();
  }

  public async deleteOne(filter: mongoose.FilterQuery<T>) {
    return this._model.deleteOne(filter);
  }

  public async populate(
    query: Query<T>,
    doc: T | T[any],
    type?: keyof ModelSearchPopulate<T, any>
  ) {
    try {
      const populates = type ? this.getPopulates(type) : [];
      populates.push(...this.queryModel.getValidPopulate(query.populate));
      await this.populateDoc(doc, populates);
    } catch (e) {
      // empty
    }
  }

  public getPopulates(type: keyof ModelSearchPopulate<T, any>) {
    const populate = this.queryModel.populate;
    if (!populate || populate.length === 0) {
      return [];
    }
    return populate.filter((x) => x[type] || x.onAll);
  }

  public async updateMany(ids: mongoose.Types.ObjectId[], body: Partial<T>) {
    // @ts-ignore
    return this._model.updateMany({ _id: { $in: ids } }, { $set: body });
  }

  public async deleteMany(ids: mongoose.Types.ObjectId[]) {
    // @ts-ignore
    return this._model.deleteMany({ _id: { $in: ids } });
  }

  public async subCreate<K extends keyof T>(
    sub: K,
    query: Query<T>,
    body: any
  ): Promise<(T[K] extends [] ? T[K][0] : null) | null> {
    if (!('_id' in body)) {
      body['_id'] = new mongoose.Types.ObjectId();
    }
    await this._model.updateOne(
      { ...query.root } as mongoose.FilterQuery<T>,
      // @ts-ignore
      { $push: { [sub]: body } }
    );
    return this.subFindOne(sub, query, { _id: body._id });
  }

  public async subSearch<K extends keyof T>(
    sub: K,
    query: Query<T>,
    rootQuery: mongoose.FilterQuery<T>
  ): Promise<{
    count: number;
    limit: number;
    skip: number;
    data: SubDocArray<T, K>;
  }> {
    const subQuery = query.createQuery({ noRoot: true });
    const populate = query.populate;
    const limit = query.limit;
    const skip = query.skip;
    const $lookups = this.queryModel.getSubPopulateLookup(query, sub);
    const { $filter, $match } = this.queryModel.getSubFilterConditionAndMatch(
      subQuery,
      sub
    );

    const pipeline = [
      { $match: rootQuery },
      {
        $project: {
          [sub]: { $filter },
          count: { $size: `$${String(sub)}` },
        },
      },
      { $unwind: `$${String(sub)}` },
      ...(skip ? [{ $skip: skip }] : []),
      ...(limit ? [{ $limit: limit }] : []),
      ...$lookups,
    ];
    if (Object.keys($match).length > 0) {
      for (const key in $match) {
        if ($match.hasOwnProperty(key)) {
          const [path, pathKey] = key.split('.');
          if (pathKey && populate.some((pop) => pop.path === path)) {
            $match[`${path}.${pathKey}`] = toValidTextRegexp($match[key]);
          } else if (typeof $match[key] === 'string') {
            $match[`${String(sub)}.${path}`] = toValidTextRegexp($match[key]);
          } else {
            $match[`${String(sub)}.${path}`] = $match[key];
          }
          delete $match[key];
        }
      }
      pipeline.push({ $match });
    }
    const arr = await this._model.aggregate(pipeline);
    return arr.reduce(
      (obj, item) => {
        const data = { ...item[sub] };
        for (const key in item) {
          if (!['_id', 'count', 'skip', 'limit', sub].includes(key)) {
            data[key] = Array.isArray(item[key]) ? item[key][0] : item[key];
          }
        }
        return {
          count: item.count,
          data: [...obj.data, data],
          skip: obj.skip,
          limit: obj.limit,
        };
      },
      { count: 0, data: [], skip, limit }
    );
  }

  public async subFindOne<K extends keyof T>(
    sub: K,
    query: Query<T>,
    subQuery: mongoose.FilterQuery<T[K]>
  ): Promise<SubDocItem<T, K>> {
    const subDoc = await this._model.findOne(
      {
        ...query.root,
        [sub]: { $elemMatch: subQuery },
      } as mongoose.FilterQuery<T>,
      { [`${String(sub)}.$`]: 1 }
    );
    return this.getSubDocument<K>(sub, subDoc);
  }

  public async subFindOneAndUpdate<K extends keyof T>(
    sub: K,
    query: Query<T>,
    subQuery: mongoose.FilterQuery<T[K]>,
    body: T[K]
  ): Promise<(T[K] extends [] ? T[K][0] : null) | null> {
    const $set: any = {};
    // tslint:disable-next-line:forin
    for (const key in body) {
      $set[`${String(sub)}.$.${key}`] = body[key];
    }
    await this._model.updateOne(
      {
        ...query.root,
        [sub]: { $elemMatch: subQuery },
      } as mongoose.FilterQuery<T>,
      // @ts-ignore
      { $set }
    );
    return this.subFindOne(sub, query, subQuery);
  }

  public async subDelete<K extends keyof T>(
    sub: K,
    query: Query<T>,
    subQuery: mongoose.FilterQuery<T[K]>
  ): Promise<(T[K] extends [] ? T[K][0] : null) | null> {
    const subDoc = await this.subFindOne(sub, query, subQuery);
    if (!subDoc) return null;
    await this._model.updateOne(
      {
        ...query.root,
        [sub]: { $elemMatch: subQuery },
      } as mongoose.FilterQuery<T>,
      // @ts-ignore
      { $pull: { [sub]: { _id: subDoc._id } } }
    );
    return subDoc;
  }

  async subPopulate<R extends Request, SD, K extends keyof T>(
    query: Query<T>,
    subDoc: SD,
    sub: K,
    type?: keyof ModelSearchPopulate<T, K>
  ) {
    const populates = type ? this.getSubPopulate(sub, type) : [];
    populates.push(...this.queryModel.getValidPopulate(query.populate, sub));
    return this.populateDoc(subDoc, populates, sub as string);
  }

  public getSubPopulate<K extends keyof T>(
    sub: K,
    type: keyof ModelSearchPopulate<T, K>
  ) {
    const subs = this.queryModel.subs;
    if (!subs) return [];
    const docSub = subs.find((x) => x.sub === sub);
    if (!docSub) return [];
    return docSub.populate.filter((x) => x[type] || x.onAll);
  }

  private getSubDocument<K extends keyof T>(
    key: K,
    doc?: T | null
  ): SubDocItem<T, K> {
    if (!doc) return null;
    const array = doc[key] as unknown as SubDocArray<T, K>;
    if (array && Array.isArray(array)) {
      // @ts-ignore
      return array[0] || null;
    }
    return null;
  }

  public validateBody(body: Partial<T>) {
    const invalidFields = [];
    if (this.queryModel.publicFields) {
      for (const key in body) {
        if (body.hasOwnProperty(key)) {
          if (!this.queryModel.publicFields.includes(key as any)) {
            invalidFields.push(key);
          }
        }
      }
    }
    return invalidFields.length > 0 ? invalidFields : null;
  }

  public toJSON(_: unknown, ret: T) {
    if (this.queryModel.privateFields) {
      for (const key of this.queryModel.privateFields) {
        // @ts-ignore
        if (key in ret) {
          // @ts-ignore
          delete ret[key];
        }
      }
    }
  }

  private populateDoc<D extends any>(
    doc: D,
    populates: ModelSearchPopulate<any, any>[],
    subPath?: string
  ) {
    return Promise.all(
      populates.map(async (populate) => {
        try {
          let subPathDoc: any;
          if (subPath) {
            subPathDoc = (this._model.schema as any).subpaths[
              `${subPath}.${populate.path}`
            ];
          } else {
            subPathDoc = this._model.schema.paths[populate.path];
          }
          let ref = populate.ref || subPathDoc?.options.ref;
          if (!ref && Array.isArray(subPathDoc?.options.type)) {
            ref = subPathDoc.options.type[0].ref;
          }
          if (!ref) {
            throw new Error(
              `ref was not defined in model with path ${populate.path}`
            );
          }
          const model = mongoose.model(ref);
          await model.populate(doc, {
            path: populate.path,
            select: populate.select.join(' '),
            ...(populate.populate ? { populate: populate.populate } : {}),
          });
        } catch (e) {
          console.error(e);
          console.error({ doc, populates, path: subPath });
          return Promise.resolve();
        }
      })
    );
  }
}