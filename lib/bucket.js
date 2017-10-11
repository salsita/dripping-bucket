export default class Bucket {
  // options: {
  //   storage: {
  //     type: 'memory'     (string, what data storage to use, default: 'memory')
  //     ...                (more options per storage type, see storage-<type>.js)
  //   },
  //   buckets: {
  //     size: 100,         (integer, total size of the bucket, default: 100)
  //     refreshRate: 50,   (integer, how many tokens do we gain each refreshInterval, default: 50)
  //     refreshInterval: 1 (integer, how often (in number of seconds) do we get new toekns, default: 1s)
  //   }
  // }
  // serviceStartedTime (integer):
  //   start time (in ms since 1970/1/1) since when we've started filling the buckets,
  //   0 (default) if to use `Date.now()` time
  //
  constructor(options, serviceStartedTime = 0) {
    this.options = Object.assign({
      storage: {
        type: 'memory'
      },
      buckets: {
        size: 100,
        refreshRate: 50,
        refreshInterval: 1
      }
    }, options);
    this.started = serviceStartedTime || Date.now();
  }

  // entityId (string):
  //   name of the leaky-bucket
  // currentTime (integer):
  //   current time (in ms since 1970/1/1), 0 (default) if to use `Date.now()` time
  //   assumption: you always call methods with non-decreasing value of `currentTime`
  //
  // returns information about given bucket for given time
  //
  getInfo(entityId, currentTime = 0) {
    return entityId + currentTime;
  }

  // entityId (string):
  //   name of the leaky-bucket
  // currentTime (integer):
  //   current time (in ms since 1970/1/1), 0 (default) if to use `Date.now()` time
  //   assumption: you always call methods with non-decreasing value of `currentTime`
  //
  // returns time amount (in ms) you need to wait until you can perform your operation
  // on the leaky-bucket without violating leaky-bucket contraints. if the returned value
  // is zero, it is expected that you perform the operation right-away, which consumes
  // leaky-bucket token, that you need to explicitly return back using `returnToken`
  // function. this mechanism prevents you rfom having more operations running in parallel
  // then what is the leaky-bucket size
  //
  getDelay(entityId, currentTime = 0) {
    return entityId + currentTime;
  }

  // entityId (string):
  //   name of the leaky-bucket
  //
  returnToken(entityId) {
    return entityId;
  }
}
