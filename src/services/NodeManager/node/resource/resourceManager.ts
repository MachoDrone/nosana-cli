import { Resource } from '@nosana/sdk/dist/types/resources.js';

import { clientSelector } from '../../../../api/client.js';
import { getSDK } from '../../../sdk.js';
import { ContainerOrchestrationInterface } from '../../provider/containerOrchestration/interface.js';
import { NodeRepository } from '../../repository/NodeRepository.js';
import { createResourceName } from './helpers/createResourceName.js';
import { ImageManager, RequiredImage } from './image/imageManager.js';
import { VolumeManager } from './volume/volumeManager.js';

export type MarketRequiredImage =
  | string
  | {
      name: string;
      server?: string;
      username?: string;
      password?: string;
    };

/** Host-manager and CLI releases are independent; accept both wire formats. */
export function normalizeMarketImages(
  images: MarketRequiredImage[],
): RequiredImage[] {
  return images.map((image) => {
    if (typeof image === 'string') return { name: image };
    const { name, server, username, password } = image;
    return username || password
      ? { name, auth: { server, username, password } }
      : { name };
  });
}

export class ResourceManager {
  private required_market: string | undefined;

  public images: ImageManager;
  public volumes: VolumeManager;

  constructor(
    private containerOrchestration: ContainerOrchestrationInterface,
    private repository: NodeRepository,
  ) {
    this.images = new ImageManager(containerOrchestration, repository);
    this.volumes = new VolumeManager(containerOrchestration, repository);
  }

  public async resyncResourcesDB(): Promise<void> {
    await this.images.resyncImagesDB();
    await this.volumes.resyncResourcesDB();

    if (this.required_market) {
      await this.fetchMarketRequiredResources(this.required_market);
    }
  }

  public async fetchMarketRequiredResources(market: string): Promise<void> {
    this.required_market = market;

    try {
      const sdk = getSDK();
      const authorization = await sdk.authorization.generate(
        sdk.solana.wallet.publicKey.toString(),
      );
      const { data, error } = await clientSelector().GET(
        '/markets/{id}/required-resources',
        {
          params: {
            path: { id: market },
            header: { authorization },
          },
        },
      );

      if (error || !data) {
        return;
      }

      await this.images.pullMarketRequiredImages(
        normalizeMarketImages(data.required_images),
      );
      await this.volumes.pullMarketRequiredVolumes(
        data.required_remote_resources,
      );
    } catch (error) {
      throw error;
    }
  }

  public async prune(): Promise<void> {
    await this.images.pruneImages();
    await this.volumes.pruneVolumes();
  }

  public async getResourceVolumes(
    resources: Resource[],
    controller: AbortController,
  ): Promise<
    {
      dest: string;
      name: string;
      readonly?: boolean;
    }[]
  > {
    const volumes: { dest: string; name: string; readonly?: boolean }[] = [];

    for (const resource of resources) {
      await this.volumes.createRemoteVolume(resource, controller);
      if ((await this.volumes.hasVolume(resource)) === false) {
        const error = new Error(
          `Missing required resource ${createResourceName(resource)}.`,
        );
        throw error;
      }

      volumes.push({
        dest:
          resource.type === 'Ollama'
            ? resource.target === undefined
              ? '/root/.ollama/models'
              : resource.target
            : resource.target,
        name: await this.volumes.getVolume(resource)!,
        readonly: resource.type === 'S3' && resource.allowWrite ? false : true,
      });
    }
    return volumes;
  }
}
