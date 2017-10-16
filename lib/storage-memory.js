class MemoryStorage {
  constructor() {
    this.storage = {};
  }

  async get(key) {
    return this.storage[key];
  }

  async set(key, value) {
    this.storage[key] = value;
    return value;
  }
}

const registerFn = (factory) => factory.register('memory', (options) => new MemoryStorage(options));

export { registerFn, MemoryStorage };
