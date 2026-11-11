import { ResourceManager, normalizeMarketImages } from '../resourceManager.js';
import { ImageManager } from '../image/imageManager.js';
import { logEmitter } from '../../../monitoring/proxy/loggingProxy.js';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  generate: vi.fn(),
  volumes: vi.fn(),
}));

vi.mock('../../../../../api/client.js', () => ({
  clientSelector: () => ({ GET: mocks.get }),
}));
vi.mock('../../../../sdk.js', () => ({
  getSDK: () => ({
    solana: {
      wallet: { publicKey: { toString: () => 'node-public-address' } },
    },
    authorization: { generate: mocks.generate },
  }),
}));
vi.mock('../volume/volumeManager.js', () => ({
  VolumeManager: class {
    pullMarketRequiredVolumes = mocks.volumes;
  },
}));

function dependencies() {
  const history: Record<string, any> = {};
  const container = {
    hasImage: vi.fn().mockResolvedValue(false),
    pullImage: vi.fn().mockResolvedValue(undefined),
    deleteImage: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {
    getImageResource: vi.fn((name) => history[name]),
    updateImageResource: vi.fn((name, value) => {
      history[name] = { ...history[name], ...value };
    }),
    getImagesResources: vi.fn(() => history),
    deleteImageResource: vi.fn((name) => delete history[name]),
  };
  return { container, repository, history };
}

describe('market required resource compatibility', () => {
  beforeEach(() => {
    mocks.generate.mockResolvedValue('node-public-address:fake-signature');
  });

  it('accepts legacy names and preserves credentials only for named accounts', () => {
    expect(
      normalizeMarketImages([
        'ubuntu:22.04',
        { name: 'public/model', server: 'registry.example' },
        {
          name: 'private/model',
          server: 'registry.example',
          username: 'fixture-user',
          password: 'fixture-password',
        },
      ]),
    ).toEqual([
      { name: 'ubuntu:22.04' },
      { name: 'public/model' },
      {
        name: 'private/model',
        auth: {
          server: 'registry.example',
          username: 'fixture-user',
          password: 'fixture-password',
        },
      },
    ]);
  });

  it('sends a node-address signature and passes the normalized response to pullers', async () => {
    const { container, repository, history } = dependencies();
    const resources = [{ type: 'Ollama', model: 'test-model' }];
    mocks.get.mockResolvedValue({
      data: {
        required_images: ['ubuntu:22.04', { name: 'registry/image' }],
        required_remote_resources: resources,
      },
    });
    const manager = new ResourceManager(container as any, repository as any);
    await manager.fetchMarketRequiredResources('market-public-address');
    expect(mocks.generate).toHaveBeenCalledWith('node-public-address');
    expect(mocks.get).toHaveBeenCalledWith('/markets/{id}/required-resources', {
      params: {
        path: { id: 'market-public-address' },
        header: { authorization: 'node-public-address:fake-signature' },
      },
    });
    expect(container.pullImage.mock.calls).toEqual([
      ['ubuntu:22.04', undefined],
      ['registry/image', undefined],
    ]);
    expect(Object.keys(history)).toEqual(['ubuntu:22.04', 'registry/image']);
    expect(mocks.volumes).toHaveBeenCalledWith(resources);
  });

  it.each([{ error: { message: 'Unauthorized' } }, {}])(
    'does not change cached resources after an unsuccessful response: %j',
    async (response) => {
      const { container, repository } = dependencies();
      mocks.get.mockResolvedValue(response);
      const manager = new ResourceManager(container as any, repository as any);
      await manager.fetchMarketRequiredResources('market-public-address');
      expect(container.pullImage).not.toHaveBeenCalled();
      expect(repository.updateImageResource).not.toHaveBeenCalled();
      expect(mocks.volumes).not.toHaveBeenCalled();
    },
  );

  it('does not issue an unauthenticated request when signing fails', async () => {
    const { container, repository } = dependencies();
    mocks.generate.mockRejectedValue(new Error('Signing unavailable'));
    const manager = new ResourceManager(container as any, repository as any);
    await expect(
      manager.fetchMarketRequiredResources('market-public-address'),
    ).rejects.toThrow('Signing unavailable');
    expect(mocks.get).not.toHaveBeenCalled();
    expect(container.pullImage).not.toHaveBeenCalled();
  });

  it('passes registry auth to the puller without persisting or logging it', async () => {
    const { container, repository, history } = dependencies();
    const manager = new ImageManager(container as any, repository as any);
    const auth = {
      username: 'fixture-private-user',
      password: 'fixture-private-secret',
      server: 'registry.example',
    };
    const events: string[] = [];
    const capture = (entry: unknown) => events.push(JSON.stringify(entry));
    logEmitter.on('log', capture);
    try {
      await manager.pullMarketRequiredImages([{ name: 'private/image', auth }]);
    } finally {
      logEmitter.off('log', capture);
    }
    expect(container.pullImage).toHaveBeenCalledWith('private/image', auth);
    expect(history['private/image']).toMatchObject({
      required: true,
      isPrivate: true,
      usage: 1,
    });
    expect(JSON.stringify(history)).not.toContain('fixture-private');
    expect(events.join('\n')).not.toContain('fixture-private');
    expect(events.join('\n')).toContain('[REDACTED registry authentication]');

    // When the market releases it, a private image is removed immediately,
    // even though its last-use time is recent.
    container.hasImage.mockResolvedValue(true);
    await manager.pullMarketRequiredImages([]);
    await manager.resyncImagesDB();
    expect(container.deleteImage).toHaveBeenCalledWith('private/image');
    expect(repository.deleteImageResource).toHaveBeenCalledWith(
      'private/image',
    );
  });

  it('marks an already cached job image required without losing its history', async () => {
    const { container, repository, history } = dependencies();
    const lastUsed = new Date('2026-01-01T00:00:00Z');
    history['cached/image'] = { required: false, lastUsed, usage: 8 };
    container.hasImage.mockResolvedValue(true);
    const manager = new ImageManager(container as any, repository as any);
    await manager.pullMarketRequiredImages([{ name: 'cached/image' }]);
    expect(container.pullImage).not.toHaveBeenCalled();
    expect(history['cached/image']).toEqual({
      required: true,
      lastUsed,
      usage: 8,
      isPrivate: false,
    });
  });
});
