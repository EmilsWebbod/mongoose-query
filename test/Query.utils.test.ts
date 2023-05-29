import { describe, expect, it } from 'vitest';
import {
  mongooseQueryPopulate,
  mongooseQuerySkipLimit,
  mongooseQuerySortSelect,
  mongooseQueryWithOperation,
} from '../src/utils/Query.utils';

describe('Query', () => {
  describe('Skip and limit', () => {
    it('should return correct skip and limit', () => {
      const { skip, limit } = mongooseQuerySkipLimit({
        skip: '1',
        limit: '2',
      });
      expect(skip).toBe(1);
      expect(limit).toBe(2);
    });
    it('should return correct skip and limit on page', () => {
      const { skip, limit } = mongooseQuerySkipLimit({
        skip: '1',
        limit: '2',
        page: '2',
      });
      expect(skip).toBe(2);
      expect(limit).toBe(2);
    });
    it('should return correct skip and limit on page 0', () => {
      const { skip, limit } = mongooseQuerySkipLimit({
        skip: '1',
        limit: '2',
        page: '0',
      });
      expect(skip).toBeUndefined();
      expect(limit).toBeUndefined();
    });
  });

  describe('Sort and select', () => {
    it('should return correct sort and select', () => {
      const { sort, select } = mongooseQuerySortSelect({
        sort: 'name,-age date',
        select: 'name,age date',
      });
      expect(sort).toEqual(['name', '-age', 'date']);
      expect(select).toEqual(['name', 'age', 'date']);
    });

    it('should return correct sort and select with empty string', () => {
      const { sort, select } = mongooseQuerySortSelect({
        sort: '',
        select: '',
      });
      expect(sort).toEqual([]);
      expect(select).toEqual([]);
    });
  });

  describe('Populate', () => {
    it('should return correct populate', () => {
      const populate = mongooseQueryPopulate({
        populate: 'user:name,email;organization:address',
      });
      expect(populate[0]).toEqual({ path: 'user', select: ['name', 'email'] });
      expect(populate[1]).toEqual({
        path: 'organization',
        select: ['address'],
      });
    });

    it('should return correct populate with empty string', () => {
      const populate = mongooseQueryPopulate({
        $populate: '',
      });
      expect(populate).toEqual([]);
    });
  });

  describe('mongooseQueryOperations', () => {
    it('should return correct $gte_date field and value', () => {
      const { field, value } = mongooseQueryWithOperation(
        {
          $gte_date: undefined,
        },
        '$gte_date',
        '2020-01-01'
      );
      expect(field).toEqual('date');
      expect(value).toEqual({ $gte: new Date('2020-01-01') });
    });

    it('should return correct $in_id field and value', () => {
      const { field, value } = mongooseQueryWithOperation(
        {
          $in__id: undefined,
        },
        '$in__id',
        '1,2,3'
      );
      expect(field).toEqual('_id');
      expect(value).toEqual({ $in: ['1', '2', '3'] });
    });

    it('should return correct text search with $ text', () => {
      const _value = 'hello world';
      const { field, value } = mongooseQueryWithOperation(
        {
          $name: undefined,
        },
        '$name',
        _value
      );
      expect(field).toEqual('name');
      expect(value).toEqual({ $regex: new RegExp(_value, 'i') });
    });
  });
});
