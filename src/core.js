/**
 * PaginatedStreamReader reads arbitrary byte ranges from a file-like source
 * using seek-style offset and length parameters.
 *
 * The class is deliberately minimal: it accepts a handle exposing
 * `read(position, length)` and `size()`, and returns Uint8Array chunks.
 * This keeps the core free from Node.js-specific imports so it can run in
 * any JavaScript environment, while a small adapter can bridge to the
 * filesystem.
 */
export class PaginatedStreamReader {
  /**
   * @param {Object} source - object with `read(position, length)` and `size()`.
   *   `read` must return a Uint8Array of exactly `length` bytes when the
   *   requested range is valid, and throw or return a shorter array when it
   *   is not. `size()` must return the total number of bytes available.
   * @param {number} [pageSize=4096] - maximum number of bytes to fetch in a
   *   single underlying read. Must be a positive integer.
   */
  constructor(source, pageSize = 4096) {
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
      throw new RangeError('pageSize must be a positive integer');
    }
    if (typeof source.read !== 'function' || typeof source.size !== 'function') {
      throw new TypeError('source must implement read(position, length) and size()');
    }
    this._source = source;
    this._pageSize = pageSize;
  }

  /**
   * Read a range of bytes.
   *
   * The range is specified as a half-open interval [offset, offset + length).
   * If the range extends past the end of the source, the returned array is
   * shorter than `length`. If `offset` is past the end, an empty Uint8Array
   * is returned.
   *
   * Offsets and lengths are non-negative integers. The method throws a
   * RangeError on negative values or non-integers so callers fail fast
   * instead of receiving silently truncated data.
   *
   * @param {number} offset - zero-based starting byte position.
   * @param {number} length - number of bytes to read.
   * @returns {Uint8Array} the requested bytes, possibly fewer if the source
   *   is shorter than the requested range.
   */
  readRange(offset, length) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError('offset must be a non-negative integer');
    }
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError('length must be a non-negative integer');
    }

    const totalSize = this._source.size();
    if (offset >= totalSize || length === 0) {
      return new Uint8Array(0);
    }

    const available = Math.min(length, totalSize - offset);
    const result = new Uint8Array(available);
    let written = 0;

    while (written < available) {
      const chunkLength = Math.min(this._pageSize, available - written);
      const chunk = this._source.read(offset + written, chunkLength);
      if (!(chunk instanceof Uint8Array)) {
        throw new TypeError('source.read() must return a Uint8Array');
      }
      // A well-behaved source returns exactly chunkLength bytes. If it returns
      // more, we take only what we need. If it returns fewer, we stop early
      // rather than loop forever on a broken source.
      const copyLength = Math.min(chunk.length, chunkLength);
      result.set(chunk.subarray(0, copyLength), written);
      written += copyLength;
      if (chunk.length < chunkLength) {
        break;
      }
    }

    // If a broken source returned short chunks, the result is shorter than
    // available. Return a view of exactly the bytes we actually received.
    return written === available ? result : result.subarray(0, written);
  }

  /**
   * Return the total size of the underlying source in bytes.
   * @returns {number}
   */
  size() {
    return this._source.size();
  }
}
