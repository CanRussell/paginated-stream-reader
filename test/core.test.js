import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaginatedStreamReader } from '../src/core.js';

/**
 * In-memory source for tests. Backed by a Uint8Array.
 * read() returns exactly the requested number of bytes when the range is
 * valid, and throws when it is not, matching the documented contract.
 */
class MemorySource {
  constructor(data) {
    this.data = data;
  }

  size() {
    return this.data.length;
  }

  read(position, length) {
    if (!Number.isInteger(position) || position < 0) {
      throw new RangeError('position must be a non-negative integer');
    }
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError('length must be a non-negative integer');
    }
    if (position + length > this.data.length) {
      throw new RangeError('read exceeds source size');
    }
    return this.data.subarray(position, position + length);
  }
}

function makeSource(bytes) {
  return new MemorySource(Uint8Array.from(bytes));
}

function bytesToArray(bytes) {
  return Array.from(bytes);
}

test('readRange returns the exact requested bytes for a valid range', () => {
  const data = makeSource([10, 20, 30, 40, 50, 60, 70, 80]);
  const reader = new PaginatedStreamReader(data, 4);
  const result = reader.readRange(2, 4);
  assert.deepEqual(bytesToArray(result), [30, 40, 50, 60]);
});

test('readRange reads across page boundaries', () => {
  const data = makeSource([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const reader = new PaginatedStreamReader(data, 3);
  const result = reader.readRange(2, 6);
  assert.deepEqual(bytesToArray(result), [3, 4, 5, 6, 7, 8]);
});

test('readRange truncates at end of source', () => {
  const data = makeSource([1, 2, 3, 4, 5]);
  const reader = new PaginatedStreamReader(data, 2);
  const result = reader.readRange(3, 10);
  assert.deepEqual(bytesToArray(result), [4, 5]);
});

test('readRange returns empty array when offset is past end', () => {
  const data = makeSource([1, 2, 3]);
  const reader = new PaginatedStreamReader(data, 2);
  const result = reader.readRange(5, 2);
  assert.equal(result.length, 0);
  assert.ok(result instanceof Uint8Array);
});

test('readRange returns empty array for zero length', () => {
  const data = makeSource([1, 2, 3, 4]);
  const reader = new PaginatedStreamReader(data, 2);
  const result = reader.readRange(1, 0);
  assert.equal(result.length, 0);
  assert.ok(result instanceof Uint8Array);
});

test('readRange handles empty source', () => {
  const data = makeSource([]);
  const reader = new PaginatedStreamReader(data, 4);
  const result = reader.readRange(0, 10);
  assert.equal(result.length, 0);
});

test('readRange throws RangeError for negative offset', () => {
  const data = makeSource([1, 2, 3]);
  const reader = new PaginatedStreamReader(data, 2);
  assert.throws(() => reader.readRange(-1, 2), RangeError);
});

test('readRange throws RangeError for negative length', () => {
  const data = makeSource([1, 2, 3]);
  const reader = new PaginatedStreamReader(data, 2);
  assert.throws(() => reader.readRange(0, -1), RangeError);
});

test('readRange throws RangeError for non-integer offset', () => {
  const data = makeSource([1, 2, 3]);
  const reader = new PaginatedStreamReader(data, 2);
  assert.throws(() => reader.readRange(1.5, 2), RangeError);
});

test('readRange throws RangeError for non-integer length', () => {
  const data = makeSource([1, 2, 3]);
  const reader = new PaginatedStreamReader(data, 2);
  assert.throws(() => reader.readRange(0, 2.5), RangeError);
});

test('constructor throws RangeError for non-positive pageSize', () => {
  const data = makeSource([1, 2, 3]);
  assert.throws(() => new PaginatedStreamReader(data, 0), RangeError);
  assert.throws(() => new PaginatedStreamReader(data, -4), RangeError);
  assert.throws(() => new PaginatedStreamReader(data, 1.5), RangeError);
});

test('constructor throws TypeError for source missing read or size', () => {
  assert.throws(() => new PaginatedStreamReader({}), TypeError);
  assert.throws(
    () => new PaginatedStreamReader({ read() {}, size: 42 }),
    TypeError
  );
});

test('readRange propagates errors from source.read', () => {
  const badSource = {
    size() {
      return 100;
    },
    read() {
      throw new Error('disk failure');
    },
  };
  const reader = new PaginatedStreamReader(badSource, 10);
  assert.throws(() => reader.readRange(0, 10), /disk failure/);
});

test('readRange handles source returning short chunks', () => {
  let calls = 0;
  const shortSource = {
    size() {
      return 10;
    },
    read(position, length) {
      calls++;
      // First call returns only half of the requested bytes.
      if (calls === 1) {
        return new Uint8Array([1, 2]);
      }
      return new Uint8Array(length);
    },
  };
  const reader = new PaginatedStreamReader(shortSource, 4);
  const result = reader.readRange(0, 4);
  // The implementation stops after the short chunk and returns only the
  // bytes actually received.
  assert.deepEqual(bytesToArray(result), [1, 2]);
  assert.equal(calls, 1);
});

test('size() delegates to source', () => {
  const data = makeSource([1, 2, 3, 4, 5]);
  const reader = new PaginatedStreamReader(data, 2);
  assert.equal(reader.size(), 5);
});
