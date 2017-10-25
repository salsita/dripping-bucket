import _ from 'lodash';
import { singletonFactory as storageFactory } from './storage';

export default class Bucket {
  // options: {
  //   storage: {
  //     type: 'memory'     (string, what data storage to use, default: 'memory')
  //     ...                (more options per storage type, see storage-<type>.js)
  //   },
  //   buckets: {
  //     size: 100,         (number, total size of the bucket, default: 100)
  //     refreshRate: 50,   (number, how many tokens do we gain each refreshInterval, default: 50)
  //     refreshInterval: 1 (number, how often (in number of seconds) do we regain more capacity, default: 1s)
  //   },
  //   waitForTokenMs: 50   (number, in case there is time-based scheduling capacity but no tokens available,
  //                         how long (in ms) to wait for the token, default: 50ms)
  // }
  // startTime (integer):
  //   start time (in ms since 1970/1/1) since when we've started filling the buckets,
  //   undefined (default) if to use `Date.now()` time
  //
  constructor(options, startTime = undefined) {
    this.options = _.merge({
      storage: {
        type: 'memory'
      },
      buckets: {
        size: 100,
        refreshRate: 50,
        refreshInterval: 1
      },
      waitForTokenMs: 50
    }, options);
    this.options.buckets.refreshIntervalMs = this.options.buckets.refreshInterval * 1000;
    this.started = (startTime === undefined) ? Date.now() : startTime;
    this.storage = storageFactory.create(this.options.storage.type, this.options.storage);
  }

  // entityId (string):
  //   name of the leaky-bucket
  // currentTime (integer):
  //   current time (in ms since 1970/1/1), undefined (default) if to use `Date.now()` time
  //   assumption: you always call methods with non-decreasing value of `currentTime`
  //
  // returns time amount (in ms) you need to wait until you can perform your operation
  // on the leaky-bucket without violating leaky-bucket contraints. if the returned value
  // is zero, it is expected that you perform the operation right-away, which consumes
  // leaky-bucket token, that you need to explicitly return back using `returnToken()`
  // function. this mechanism prevents you from having more operations running in parallel
  // than what is the leaky-bucket size
  //
  async getDelay(entityId, currentTime = undefined) {
    const now = (currentTime === undefined) ? Date.now() : currentTime;
    let bucket = await this.storage.get(entityId);
    bucket = bucket || {
      ops: {
        tokens: this.options.buckets.size, // token-based limiter: how many tokens are available currently to perform operations
        last: this.started,                // last time when we performed operation for real (time- and token- based)
        capacity: 0                        // remaining capacity for the .last ^^ interval (time-based)
      },
      wait: {
        last: this.started - this.options.buckets.refreshIntervalMs,  // last time when we needed to postpone an operation
        capacity: 0                        // remaining capacity for the .last ^^ interval (time-based)
      }
    };

    if (bucket.ops.tokens) {
      // we have tokens, we can perform the operation in case the time-based scheduling allows it
      if (this.getIntervalDiff(now, bucket.ops.last) > 0) {
        // perform the operation now
        this.updateBucketOpsCapacity(bucket, now);
        this.performOperation(bucket, now);
        await this.storage.set(entityId, bucket);
        return 0;
      } else {
        if (bucket.ops.capacity) {
          // perform the operation now we have remaining capacity for this interval
          this.performOperation(bucket, now);
          await this.storage.set(entityId, bucket);
          return 0;
        } else {
          // operation will have to wait
          this.waitOperation(bucket, now);
          await this.storage.set(entityId, bucket);
          return bucket.wait.last - now;
        }
      }
    } else {
      // no operation tokens available --> no chance to perform the operation now, we need to postpone it
      if (now < bucket.wait.last) {
        // we postponed some operation for the future already
        if (!bucket.wait.capacity) { this.advanceWait(bucket, bucket.wait.last); }
      } else {
        // no operation has been postponed for the future yet
        const next = now + this.options.waitForTokenMs;  // when to check again if we got any token back
        this.updateBucketWaitCapacity(bucket, next);
        if (bucket.wait.capacity) {
          bucket.wait.last = next;
        } else {
          this.advanceWait(bucket, next);
        }
      }
      bucket.wait.capacity--;
      await this.storage.set(entityId, bucket);
      return bucket.wait.last - now;
    }
  }

  // entityId (string):
  //   name of the leaky-bucket
  //
  async returnToken(entityId) {
    const bucket = await this.storage.get(entityId);
    if (bucket) {
      bucket.ops.tokens++;
      await this.storage.set(entityId, bucket);
    }
  }

  // ! static !
  // registerFn: (factory) => { register createFn under storage type name }
  //
  static registerStorage(registerFn) {
    registerFn(storageFactory);
  }

  // --- end of public methods, only internal methods below ---

  getIntervalNumber(time) {
    return Math.floor(time / this.options.buckets.refreshIntervalMs);
  }

  getIntervalDiff(time1, time2) {
    return this.getIntervalNumber(time1) - this.getIntervalNumber(time2);
  }

  updateBucketOpsCapacity(bucket, now) {
    bucket.ops.capacity = Math.min(
      this.options.buckets.size,
      bucket.ops.capacity + this.getIntervalDiff(now, bucket.ops.last) * this.options.buckets.refreshRate
    );
  }

  performOperation(bucket, now) {
    bucket.ops.last = now;
    bucket.ops.capacity--;
    bucket.ops.tokens--;
  }

  waitOperation(bucket, now) {
    // tokens are available
    if (this.getIntervalDiff(now, bucket.wait.last) > 0) {
      // last time we postponed an operation is already in previous interval
      this.advanceWait(bucket, now);
    } else if (this.getIntervalDiff(now, bucket.wait.last) === 0) {
      // in current interval: no capacity left --> all possible operations have already been performed,
      // there is also something enqueued in the waiting queue --> all that has been enqueued to wait for
      // the current interval, should have been enqueued for the next interval, actually
      const currentCapacity = bucket.wait.capacity;
      this.advanceWait(bucket, now);
      bucket.wait.capacity = currentCapacity;
      if (!bucket.wait.capacity) { this.advanceWait(bucket, bucket.wait.last); } // next interval was full
    } else {
      // there is already a message postponed for future interval
      if (!bucket.wait.capacity) { this.advanceWait(bucket, bucket.wait.last); } // and that interval was full
    }
    bucket.wait.capacity--;
  }

  advanceWait(bucket, from) {
    bucket.wait.last = (this.getIntervalNumber(from) + 1) * this.options.buckets.refreshIntervalMs;
    bucket.wait.capacity = this.options.buckets.refreshRate;
  }

  updateBucketWaitCapacity(bucket, now) {
    if (bucket.wait.last < bucket.ops.last) {
      // operation capacity is more up-to-date, let's use it
      bucket.wait.capacity = Math.min(
        this.options.buckets.size,
        bucket.ops.capacity + this.getIntervalDiff(now, bucket.ops.last) * this.options.buckets.refreshRate
      );
    } else {
      // postponing capacity is more up-to-date, let's use it
      bucket.wait.capacity = Math.min(
        this.options.buckets.size,
        bucket.wait.capacity + this.getIntervalDiff(now, bucket.wait.last) * this.options.buckets.refreshRate
      );
    }
  }
}

// for backward compatibility
module.exports.Bucket = Bucket;
