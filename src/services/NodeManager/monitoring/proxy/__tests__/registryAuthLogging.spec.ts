import {
  createFunctionLoggingProxy,
  createLoggingProxy,
  logEmitter,
} from '../loggingProxy.js';

describe('registry authentication logging', () => {
  it.each(['method', 'function'])(
    'redacts %s pull arguments on failure without altering authentication',
    async (kind) => {
      const auth = { username: 'fixture-user', password: 'fixture-secret' };
      const observed: unknown[][] = [];
      async function pullImage(image: string, credentials: typeof auth) {
        observed.push([image, credentials]);
        throw new Error('Registry denied request');
      }
      const wrapped =
        kind === 'method'
          ? createLoggingProxy({ pullImage }).pullImage
          : createFunctionLoggingProxy(pullImage);
      const events: any[] = [];
      const capture = (entry: unknown) =>
        events.push(JSON.parse(JSON.stringify(entry)));
      logEmitter.on('log', capture);
      try {
        await expect(wrapped('registry/image', auth)).rejects.toThrow(
          'Registry denied request',
        );
      } finally {
        logEmitter.off('log', capture);
      }
      expect(observed).toEqual([['registry/image', auth]]);
      expect(events.map((entry) => entry.type)).toEqual(['call', 'error']);
      expect(
        events.every(
          (entry) =>
            entry.arguments[1] === '[REDACTED registry authentication]',
        ),
      ).toBe(true);
      expect(JSON.stringify(events)).not.toContain('fixture-user');
      expect(JSON.stringify(events)).not.toContain('fixture-secret');
    },
  );
});
