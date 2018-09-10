[![Dependency Status](https://img.shields.io/david/salsita/dripping-bucket.svg)](https://david-dm.org/salsita/dripping-bucket)
[![devDependency Status](https://img.shields.io/david/dev/salsita/dripping-bucket.svg)](https://david-dm.org/salsita/dripping-bucket?type=dev)
![Downloads](https://img.shields.io/npm/dm/dripping-bucket.svg?style=flat)
![Licence](https://img.shields.io/npm/l/dripping-bucket.svg?style=flat)
[![Known Vulnerabilities](https://snyk.io/test/github/salsita/dripping-bucket/badge.svg)](https://snyk.io/test/github/salsita/dripping-bucket)

# dripping-bucket

Library to calculate delays for operations running against rate-limited services.  
Written in ES2015, featuring classes, imports / exports, and async / await.  
The library tests are written in async jest.

## Installation

```
$ npm i dripping-bucket
```

## Usage

```
import Bucket from 'dripping-bucket';
const bucket = new Bucket({ buckets: { size: 42, refreshRate: 10 } });
const delay = await bucket.getDelay('testing');
if (!delay) {
  // perform the operation:
  // ...
  // and return the token back:
  await bucket.returnToken('testing');
} else {
  // postpone the operation by delay ms
  // ...
}
```

In your ES5 code, use `require()` instead of `import`:
```
const Bucket = require('dripping-bucket').Bucket;
...
```

## Why another library?

There are other client libraries already for this purpose, their API expects callbacks that are executed when rate-limit allows. And by then the callbacks are enqueued in some internal (memory) structure. Our library is written to play well with messaging services (e.g. RabbitMQ) where we don't want to pile up callbacks in memory of the process (as the process can crash, and also it doesn't scale well).

In our scenario, there is a message handler subscribed to a queue. Each message there represents an operation (e.g. an API call) that needs to be executed as soon as possible, while respecting the rate-limiting rules enforced by the server code. We want the API call to go through immediately if possible, but if there are too many operations requested in short time, we want to postpone them and revisit their scheduling in the future. There is another (delay) queue, into which we push all messages for operations we cannot perform right away. We set TTL value on those messages to see the messages again when there is a reasonable chance that we could perform the operation (e.g. make the actual API call).

Of course we don't know what other messages (operation requests) will come through the request queue (i.e. the real-time / not-delayed one), so it is just an educated guess and sometimes it happens we need to postpone the operation more than once. This also means that the order of the operation execution is not guaranteed.

## API

### constructor(options, startTime = undefined)

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
    refreshRate: 50,   (number, how many tokens do we gain each refresh interval, default: 50)
    refreshInterval: 1 (number, how often (in number of seconds) we regain more capacity, default: 1s)
  },
  waitForTokenMs: 50   (number, in case there is time-based scheduling capacity but no tokens available,
                        how long (in ms) to wait for the token, default: 50ms)
}
```

Default in-memory storage (for holding information to calculate the delays, not for holding information about target operations to be performed) is good enough only when you calculate the delays from single process and the refresh interval of the bucket is short (as if your process crashes and is restarted, it will need to wait one refresh interval (at most) to regain some capacity). For other cases you can use other storage types, see Storage management section below.

The size of the buckets define not only the maximum requests allowed per one refresh interval, but also the maximum number of operations executed concurrently. We combine time-interval-based calculations with token-based approach to make sure we don't break the rate-limits on the server side.

```
startTime (integer):
  start time (in ms since 1970/1/1) since when we've started filling the buckets,
  undefined (default) if to use `Date.now()` time
```

Ignore this parameter when using the library for real-time calculations, it is here to help with testing.

### async getDelay(entityId, currentTime = undefined)

This is the main function of the calculator. For given id of the entity you are rate-limiting against (e.g. user id, project id, shop id, ...) you will get the delay (in ms) you need to wait until you can perform next operation without violating server-side leaky-bucket constraints. If the returned value is zero (0), it is expected that you perform the operation right-away, which consumes one leaky-bucket token. That token you need to explicitly return back using `returnToken()` function (see below). This mechanism prevents you from having more operations running in parallel than what is the server-side leaky-bucket size.

```
entityId (string):
  name of the rate-limited entity
```
```
currentTime (integer):
  current time (in ms since 1970/1/1), undefined (default) if to use `Date.now()` time
```

Again, you can happily ignore the second parameter for real-time scheduling, it is here for unit testing. If you decide to use it, please make sure you always call `getDelay()` method with non-decreasing value of `currentTime`.

You surely noticed that this method is asynchronous (returns a promise / you need to `await` the result). It is because the storage used for saving the scheduling information might be remote / asynchronous, too.

### async returnToken(entityId)

Every time the above `getDelay()` functions returns zero (0), one operation token is taken and you are expected to perform your operation right away. Once you are done with the operation, you need to release the token by calling this method.

This method is also asynchronous, since it works with the storage.

## Storage management

Under the hood, there is a storage factory that creates new storage instances of specified types. Default storage type is `memory`, it is plain JS object used as key-value store. This will work well for single process, but to scale it, you would need to partition the entity ids and have dedicated handlers for sub-sets of entity ids. But in case you prefer vertical scaling and want multiple processes, each of them capable of handling any entity id, you will need different type of storage; one that can be accessed from multiple processes (e.g. Redis).

There is also another case when to consider different storage type: if your process with in-memory storage crashes and is restarted, it needs to wait one refreshing interval to regain some capacity of the buckets. This is fine when your refresh interval is one second (or a couple of seconds), as your execution of operations will be delayed by (up to) this amount of time. But in case you want to use the calculator for managing e.g. daily API quota, you probably don't want to wait (up to) 1 day in case your process crashes. In this case you probably want some persistent storage (e.g. some database).

The calculator performs one storage read at the beginning, then calculates the scheduling (in a fraction of millisecond), and performs one storage write at the end.

In case you access your storage from multiple processes, make sure the semantics of storage `get()` is actually lock and read, and semantics of storage `set()` is actually write and unlock. That way you will avoid unpleasant surprises.

### Storage module API

When implementing new storage module, follow the example from `lib/storage-memory.js`. Storage instance is an object with two methods:
* `async get(key)`, and
* `async set(key, value)`.

Storage module must export a function that registers new storage type in storage factory (see `lib/storage.js`) that is used by this library. This registering function takes an instance of storage factory and must call its `register()` method, that has the following signature:

```
register(type, createFn)
```

The `createFn` is a function that can synchronously (!) create a new storage instance of registered `type`. The `createFn()` function has this signature:

```
create(options)
```

and (again: synchronously!) returns instance of the storage. If there is any asynchronous code necessary (e.g. connect to target DB), you should postpone it until first `get(key)` method is invoked.

As already mentioned: to be able to use your storage implementation, you need to register it with the storage factory used by this library. To do so, use static method

```
Bucket.registerStorage(registerFn)
```

### Example

```
// --- your storage-redis.js ---

class RedisStorage {
  constructor(options) { ... }
  async get(key) { ... }
  async set(key, value) { ... }
}

const registerFn = (factory) => factory.register('redis', (options) => new RedisStorage(options));
export { registerFn, RedisStorage };

// --- your main.js ---

import Bucket from './bucket';
import { registerFn as registerRedisFn } from './storage-redis';

Bucket.registerStorage(registerRedisFn);
const bucket = new Bucket({ storage: { type: 'redis', connectionString: '...' }, ... });
const delay = await bucket.getDelay('testing');
if (!delay) {
  // perform the operation
  // ...
  await bucket.returnToken('testing');
} else {
  // postpone the operation by delay ms
  // ...
}
```

## Building from code

```
$ git clone git@github.com:salsita/dripping-bucket.git
$ cd dripping-bucket
$ npm i
```

The library code is in `lib/bucket.js`.

```
$ npm run lint   # to lint the code
$ npm test       # to run the tests
$ npm run build  # to run lint, tests, and transpile to ES5 for publishing
```

## Licence

MIT License

Copyright (c) 2017, 2018 Salsita Software

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
