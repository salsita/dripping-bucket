# dripping-bucket

Library to calculate delays for operations running against rate-limited services.

### Why another library?

There are other client libraries already for this purpose, their API expects callbacks that are executed when rate-limit allows. And by then the callbacks are enqueued in some internal (memory) structure. Our library is written to play well with messaging services where we don't want to pile up callbacks in memory of the process (the process can crash, also it doesn't scale well).

In our scenario, there is a message handler subscribed to a queue. Each message there represents an operation (API call) that needs to be executed as soon as possible, respecting the rate-limiting rules enforced by the server code. We want the API call to go through immediately if possible, but if there are too many operations requested in short time, we want to postpone them and revisit in the future. There is another (delay) queue, into which we push all messages for operations we cannot perform right away. We set TTL value on those messages to see the messages again when there is a reasonable chance that we could perform the operation (make the actual API call).

Of course we don't know what other messages will come on request (i.e. not-delayed) queue, so it is just a best guess and sometimes it happens we need to postpone the operation more than once. This also means that the order of the operation execution is not guaranteed.

The library is written in ES2015, featuring classes, imports / exports, and async / await. The library tests are written in async jest.

## Installation

```
$ npm i dripping-bucket
```

## API

```
import Bucket from 'dripping-bucket';
const bucket = new Bucket({ buckets: { size: 42, refreshRate: 10 } });
...
const delay = await bucket.getDelay('testing-bucket');
```

### `constructor(options, startTime = undefined)`

This will create a new delay calculator.

```
options (object):
{
  storage: {
    type: 'memory'     (string, what data storage to use, default: 'memory')
    ...                (more options per storage type, see storage-<type>.js)
  },
  buckets: {
    size: 100,         (number, total size of the bucket, default: 100)
    refreshRate: 50,   (number, how many tokens do we gain each refreshInterval, default: 50)
    refreshInterval: 1 (number, how often (in number of seconds) do we regain more capacity, default: 1s)
  },
  waitForTokenMs: 50   (number, in case there is time-based scheduling capacity but no tokens available,
                        how long (in ms) to wait for the token, default: 50ms)
}
```

Default in-memory storage (for holding information to calculate the delays, not to hold information about target operations to be performed) is good enough only when you calculate the delays rom single process and the refresh interval of the bucket is short (as if your process crashes, it will need to wait refresh interval (at most) to regain some capacity). For other cases you can use other storage types, see Storage management section below.

```
startTime (integer):
   start time (in ms since 1970/1/1) since when we've started filling the buckets,
   undefined (default) if to use `Date.now()` time
```

Ignore this parameter when using the library for real-time calculations, it is here to help with testing.

### `async getDelay()`

### `async returnToken()`

## Storage management

### `Bucket.registerStorage()`

## Building from code

```
$ git clone git@github.com:salsita/dripping-bucket.git
$ cd dripping-bucket
$ npm i
```

The library code is in `lib/bucket.js`.

```
$ npm run lint  # to lint the code
$ npm test      # to run the tests
```

## Licence

MIT License

Copyright (c) 2017 Salsita Software

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
