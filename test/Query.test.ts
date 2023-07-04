import { describe, expect, it } from 'vitest';
import { Query } from '../src/Query.js';

describe('Query', () => {
  it('should setup default limit and skip', () => {
    const query = new Query({});
    expect(query.skip).to.equal(0);
    expect(query.limit).to.equal(20);
  });
  it('should update limit and skip', () => {
    const query = new Query({
      limit: 10,
      skip: 1,
    });
    expect(query.skip).to.equal(1);
    expect(query.limit).to.equal(10);
  });
  it('should search name with regexp', () => {
    const query = new Query({ $name: 'Search name' });
    expect(query.createQuery()).to.deep.equal({
      name: { $regex: new RegExp('Search name', 'i') },
    });
  });
  it('should search text', () => {
    const query = new Query({ $text: 'Search text' });
    expect(query.createQuery()).to.deep.equal({
      $text: { $search: 'Search text' },
    });
    expect(query.options).to.deep.equal({
      score: { $meta: 'textScore' },
    });
  });
  it('should add model query if addToModelQueryUes', () => {
    const query = new Query({ $text: 'Search text' });
    query.addToModelQuery('user', { name: 'Test' });
    query.model = 'user' as any;
    expect(query.createQuery()).to.deep.equal({
      $and: [
        { name: 'Test' },
        {
          $text: { $search: 'Search text' },
        },
      ],
    });
    expect(query.options).to.deep.equal({
      score: { $meta: 'textScore' },
    });
  });
  it('should search list of ids', () => {
    const query = new Query({ $in__id: '1,2' });
    expect(query.createQuery()).to.deep.equal({ _id: { $in: ['1', '2'] } });
  });
  it('should search gte and lt date', () => {
    const gte = '01.01.2022';
    const lt = '01.02.2022';
    const query = new Query({
      $gte_createdAt: gte,
      $lt_createdAt: lt,
    });
    expect(query.createQuery()).to.deep.equal({
      createdAt: {
        $gte: new Date(gte),
        $lt: new Date(lt),
      },
    });
  });
  it('should sanitize input', () => {
    const value = [{ _id: '' }, { _id: '1' }];
    const query = new Query({
      $or: value,
      $and: value,
      $in: value,
      _id: {
        $and: value,
      },
    } as any);
    expect(query.createQuery()).to.deep.equal({
      _or: value,
      _and: value,
      _in: value,
      _id: { _and: value },
    });
  });
});
