import mongoose from 'mongoose';
import jsonDiffPatch from 'jsondiffpatch';

const diffPatcher = jsonDiffPatch.create({
  objectHash: (obj: any) => {
    return '_id' in obj ? obj._id.toString() : obj.toString();
  },
});

export interface IQueryHistorySchema {
  _id: mongoose.Types.ObjectId;
  locked: boolean;
  lastChange: Date;
  history: {
    _id: mongoose.Types.ObjectId;
    referenceDate: Date;
    diffDate: Date;
    diff: object;
    user: mongoose.Types.ObjectId;
  }[];
}

export const queryHistorySchema = {
  locked: { type: Boolean, default: false },
  lastChange: { type: Date, default: () => new Date() },
  history: [
    {
      type: { Type: String },
      referenceDate: { type: Date, default: () => new Date() },
      diffDate: { type: Date, default: () => new Date() },
      diff: Object,
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  ],
};

interface IQueryHistoryOptions<
  T extends IQueryHistorySchema & mongoose.Document
> {
  model?: mongoose.Model<T>;
  old?: T;
  updated?: T;
  ignoreFields?: (keyof T)[];
  type?: string;
}

export class QueryHistory<T extends IQueryHistorySchema & mongoose.Document> {
  private model: mongoose.Model<T> | undefined;
  private old: T | undefined;
  private updated: T | undefined;
  private ignoreFields: (keyof T)[] | undefined;
  private referenceDate: Date | undefined;
  private type: string | undefined;
  private meta: object | undefined;

  constructor(
    private userID: mongoose.Types.ObjectId,
    { model, old, updated, ignoreFields, type }: IQueryHistoryOptions<T>
  ) {
    this.model = model;
    this.old = old;
    this.updated = updated;
    this.ignoreFields = ignoreFields;
    this.type = type;
  }

  setReferenceDate(date: Date) {
    this.referenceDate = date;
  }

  setIgnoreFields(ignoreFields: (keyof T)[]) {
    this.ignoreFields = ignoreFields;
  }

  setModel(model: mongoose.Model<T>) {
    this.model = model;
  }

  setOldDoc(doc: T, force?: boolean) {
    if (!this.old || force) {
      this.old = doc;
    }
  }

  setType(type: string) {
    this.type = type;
  }

  setMeta(meta: object) {
    this.meta = meta;
  }

  setUpdatedDoc(doc: T) {
    this.updated = doc;
  }

  async setDiff(
    _id: mongoose.Types.ObjectId,
    referenceDate = this.referenceDate
  ) {
    const diff = diffPatcher.diff(this.getOld(), this.getUpdated());
    if (typeof diff !== 'undefined') {
      const diffDate = new Date();
      return this.getModel().updateOne(
        // @ts-ignore
        { _id },
        {
          $push: {
            history: {
              $each: [
                {
                  type: this.type,
                  user: this.userID,
                  diff,
                  diffDate,
                  referenceDate,
                  meta: this.meta,
                },
              ],
              $position: 0,
            },
          },
        }
      );
    }
  }

  async revertHistory(
    _id: mongoose.Types.ObjectId,
    historyID: mongoose.Types.ObjectId
  ) {
    const model = this.getModel();
    const [doc, historyDoc] = await Promise.all([
      // @ts-ignore
      model.findOne({ _id }).select(this.ignoreToSelect()),
      // @ts-ignore
      model.findOne({ _id, 'history._id': historyID }, { 'history.$': 1 }),
    ]);
    if (!doc) {
      throw new Error('Doc not found');
    }
    if (!historyDoc) {
      throw new Error('History not found');
    }
    const history = historyDoc.history[0];
    diffPatcher.unpatch(doc, history.diff);

    // @ts-ignore
    await model.updateOne(
      { _id },
      {
        $set: doc,
        $pull: { history: { _id: history._id } },
      }
    );

    return doc;
  }

  getOld(): T {
    if (!this.old) {
      throw new Error('missing old doc in QueryHistory');
    }
    const obj = 'toObject' in this.old ? this.old.toObject() : this.old;
    return this.removeIgnoredFields(obj);
  }

  getUpdated(): T {
    if (!this.updated) {
      throw new Error('missing updated doc in QueryHistory');
    }
    const obj =
      'toObject' in this.updated ? this.updated.toObject() : this.updated;
    return this.removeIgnoredFields(obj);
  }

  async findUpdated() {
    const updated = await this.getModel()
      .findOne({ _id: this.getOld()._id })
      .select(this.ignoreToSelect());

    if (!updated) {
      throw new Error('Updated not found');
    }

    this.updated = updated;
    return this.updated;
  }

  private ignoreToSelect() {
    return this.ignoreFields?.map((x) => `-${String(x)}`).join(' ');
  }

  private removeIgnoredFields(doc: T) {
    if (this.ignoreFields) {
      for (const field of this.ignoreFields) {
        delete doc[field];
      }
    }
    return doc;
  }

  private getModel() {
    if (!this.model) {
      throw new Error('missing model in QueryHistory');
    }
    return this.model;
  }
}
