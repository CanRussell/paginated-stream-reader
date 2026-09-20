# Paginated Stream Reader

Reads arbitrary byte ranges from large files using seek-style offset and length parameters.

```js
import { PaginatedStreamReader } from 'paginated-stream-reader';

// source must implement read(position, length) returning Uint8Array,
// and size() returning total bytes.
const source = {
  size: () => 1024 * 1024 * 100,
  read: (position, length) => {
    // In real use this would read from a file descriptor at the given
    // position. Here we just return a zero-filled chunk.
    return new Uint8Array(length);
  },
};

const reader = new PaginatedStreamReader(source, 64 * 1024);
const chunk = reader.readRange(1000, 2000);
console.log(chunk.length); // 2000
```

## Why this exists

Large files often need random access without loading the entire contents into memory. This library provides a minimal abstraction over any seekable source: the caller supplies a `read(position, length)` function and the library handles pagination, bounds checks, and range truncation. The trade-off is that the source is responsible for enforcing its own limits; the reader trusts `size()` to be correct and stops early if a read returns fewer bytes than requested.

## Awkward edge

If the underlying source returns a short chunk before the requested range is complete, the reader returns only the bytes actually received. It does not retry or loop on short reads, because doing so could hide a broken source. Callers should ensure their source returns exactly the requested number of bytes for valid ranges.

## API

### `new PaginatedStreamReader(source, pageSize = 4096)`

- `source` — object with `read(position, length)` and `size()`. `read` must return a `Uint8Array` of exactly `length` bytes for a valid range.
- `pageSize` — maximum number of bytes to fetch per underlying read. Must be a positive integer.

### `reader.readRange(offset, length)`

Returns a `Uint8Array` containing bytes from `offset` to `offset + length - 1`. If the range extends past the end of the source, the returned array is shorter than `length`. If `offset` is past the end or `length` is zero, an empty `Uint8Array` is returned.

Throws `RangeError` for negative or non-integer `offset` or `length`.

### `reader.size()`

Returns the total size reported by the source.
