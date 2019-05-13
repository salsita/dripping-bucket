import Bucket from './bucket';

// simulation runner
async function runSequence(bucket, sequence) {
  const results = [];
  let result;
  for (let i = 0; i < sequence.length; i++) {
    switch (sequence[i].type) {
      case 'request':
        result = await bucket.getDelay('test', sequence[i].time);
        break;
      case 'token':
        result = await bucket.returnToken('test');
        break;
      default:
        throw new Error(`runSequence(): unknown operation type "${sequence[i].type}" of instruction at position ${i + 1}`);
    }
    if (result !== undefined) {
      results.push(result);
    }
  }
  return results;
}

// setup:
// + bucket capacity: 10
// + refesh rate: 3
// + refresh interval: 1s
// + wait for token: 10ms
// scenario: 20 requests, 1 request / second with offset 100ms (0ms, 1.000ms, 2.000ms, ...)
test('(10/3/1s) bucket, 10ms wft, 1r/s, 20 requests, no tokens back', async () => {
  const bucket = new Bucket({
    type: 'memory',
    buckets: { size: 10, refreshRate: 3, refreshInterval: 1 },
    waitForTokenMs: 10
  }, 0);

  const sequence = [];
  for (let i = 0; i < 20; i++) { sequence.push({ type: 'request', time: i * 1000 }); }

  const expected = [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10, 10, 10, 10];

  expect.assertions(expected.length + 1);
  const actual = await runSequence(bucket, sequence);
  expect(actual.length).toBe(expected.length);
  expected.forEach((val, idx) => expect(actual[idx]).toBe(val));
});

// setup:
// + bucket capacity: 10
// + refesh rate: 3
// + refresh interval: 2s
// scenario: 20 requests, all of them at once (0ms, 0ms, ...)
test('(10/3/2s) bucket, 20r/s, 20 requests', async () => {
  const bucket = new Bucket({
    type: 'memory',
    buckets: { size: 10, refreshRate: 3, refreshInterval: 2 }
  }, 0);

  const sequence = [];
  for (let i = 0; i < 20; i++) { sequence.push({ type: 'request', time: 0 }); }

  const expected = [2000, 2000, 2000, 4000, 4000, 4000, 6000, 6000, 6000,
    8000, 8000, 8000, 10000, 10000, 10000, 12000, 12000, 12000, 14000, 14000];

  expect.assertions(expected.length + 1);
  const actual = await runSequence(bucket, sequence);
  expect(actual.length).toBe(expected.length);
  expected.forEach((val, idx) => expect(actual[idx]).toBe(val));
});

// setup:
// + bucket capacity: 10
// + refesh rate: 3
// + refresh interval: 2s
// scenario: 20 requests, all of them at once 6 seconds after start (6.000ms, 6.000ms, ...)
test('(10/3/2s) bucket, 20r/s, 20 requests, 6.000ms offset', async () => {
  const bucket = new Bucket({
    type: 'memory',
    buckets: { size: 10, refreshRate: 3, refreshInterval: 2 }
  }, 0);

  const sequence = [];
  for (let i = 0; i < 20; i++) { sequence.push({ type: 'request', time: 6000 }); }

  const expected = [0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 2000, 2000,
    4000, 4000, 4000, 6000, 6000, 6000, 8000, 8000];

  expect.assertions(expected.length + 1);
  const actual = await runSequence(bucket, sequence);
  expect(actual.length).toBe(expected.length);
  expected.forEach((val, idx) => expect(actual[idx]).toBe(val));
});

// setup:
// + service started 100ms before the start of refresh interval
// + bucket capacity: 5
// + refesh rate: 3
// + refresh interval: 3s
// scenario: 20 requests, 4 requests / second (0ms, 250ms, 500ms, ...)
test('(5/3/3s) bucket, 4r/s, 20 requests, no tokens back', async () => {
  const start = 2900;
  const bucket = new Bucket({
    type: 'memory',
    buckets: { size: 5, refreshRate: 3, refreshInterval: 3 }
  }, start);

  const sequence = [];
  for (let i = 0; i < 20; i++) { sequence.push({ type: 'request', time: start + i * 250 }); }

  const expected = [100, 0, 0, 0, 2100, 1850, 4600, 4350, 4100,
    6850, 6600, 6350, 9100, 0, 0, 8350, 8100, 10850, 10600, 10350];

  expect.assertions(expected.length + 1);
  const actual = await runSequence(bucket, sequence);
  expect(actual.length).toBe(expected.length);
  expected.forEach((val, idx) => expect(actual[idx]).toBe(val));
});

// setup:
// + bucket capacity: 10
// + refesh rate: 3
// + refresh interval: 1s
// + wait for token: 500ms
// scenario:
// + 20 requests, 5 requests / second, 3.000ms offset (3.000ms, 3.200ms, 3.400ms, ...)
// + tokens back with 2.500ms delay (from request)
test('(10/3/1s) bucket, 500ms wft, 5r/s, 20 requests, 3.000ms offset, tokens back after 2.900ms from request', async () => {
  const bucket = new Bucket({
    type: 'memory',
    buckets: { size: 10, refreshRate: 3, refreshInterval: 1 },
    waitForTokenMs: 500
  }, 0);

  const sequence = [];
  const offset = 3000;
  for (let i = 0; i < 20; i++) {
    sequence.push({ type: 'request', time: offset + i * 200 });
    if (i > 13) { sequence.push({ type: 'token' }); }
  }

  const expected = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500, 300, 100, 500, 300, 0, 0, 0, 0, 0];

  expect.assertions(expected.length + 1);
  const actual = await runSequence(bucket, sequence);
  expect(actual.length).toBe(expected.length);
  expected.forEach((val, idx) => expect(actual[idx]).toBe(val));
});
