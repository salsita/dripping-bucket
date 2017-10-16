import { registerFn as registerMemoryFn } from './storage-memory';

// Storage interface:
//   - constructor(options)
//   - async get(key): returns stored value or undefined (if key has not yet been used)
//   - async set(key, value): returns value

class StorageFactory {
  constructor() {
    // mapping of storage type (string) to a function that returns new storage instance
    this.factoryFns = {};
  }

  // synchronous function (string, object) => exception or Storage object
  create(type, options) {
    if (!this.factoryFns[type]) { throw new Error(`[storage] unsupported storage type "${type}"`); }
    return this.factoryFns[type](options);
  }

  // register new type of supported storage type
  register(type, factoryFn) {
    this.factoryFns[type] = factoryFn;
  }
}

// singleton in case you don't need multiple factory objects
const singletonFactory = new StorageFactory();
registerMemoryFn(singletonFactory);

export { singletonFactory, StorageFactory };
