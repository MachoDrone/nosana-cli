import type { DockerAuth } from '@nosana/sdk';
import { applyLoggingProxyToClass } from '../../../monitoring/proxy/loggingProxy.js';
import { ContainerOrchestrationInterface } from '../../../provider/containerOrchestration/interface.js';
import { NodeRepository } from '../../../repository/NodeRepository.js';
import { hoursSinceDate } from '../helpers/hoursSunceDate.js';
import { repoTagsContainsImage } from '../helpers/repoTagsContainsImage.js';

export type RequiredImage = { name: string; auth?: DockerAuth };

export class ImageManager {
  private fetched: boolean = false;
  private market_required_images: string[] = [];

  constructor(
    private containerOrchestration: ContainerOrchestrationInterface,
    private repository: NodeRepository,
  ) {
    applyLoggingProxyToClass(this);
  }

  public async pullMarketRequiredImages(
    required_images: RequiredImage[],
  ): Promise<void> {
    this.fetched = true;
    this.market_required_images = required_images.map(({ name }) => name);

    for (const { name, auth } of required_images) {
      if (!(await this.containerOrchestration.hasImage(name))) {
        await this.containerOrchestration.pullImage(name, auth);
      }

      // Persist only cache metadata, never registry credentials. An image
      // previously pulled by a job must also become marked market-required.
      const known = this.repository.getImageResource(name);
      this.repository.updateImageResource(name, {
        required: true,
        isPrivate: Boolean(auth) || Boolean(known?.isPrivate),
        lastUsed: known?.lastUsed ?? new Date(),
        usage: known?.usage ?? 1,
      });
    }
  }

  public async pruneImages(): Promise<void> {
    const cachedImages = await this.containerOrchestration.listImages();

    for (const { Id, RepoTags } of cachedImages) {
      const dbEntry = Object.entries(this.repository.getImagesResources()).find(
        (img) => (repoTagsContainsImage(img[0], RepoTags) ? img : undefined),
      );

      if (dbEntry && dbEntry[1].required) {
        continue;
      }

      await this.containerOrchestration.deleteImage(Id);

      if (dbEntry) {
        this.repository.deleteImageResource(dbEntry[0]);
      }
    }
  }

  public async resyncImagesDB(): Promise<void> {
    for (const [image, { lastUsed, required, isPrivate }] of Object.entries(
      this.repository.getImagesResources(),
    )) {
      if (!(await this.containerOrchestration.hasImage(image))) {
        this.repository.deleteImageResource(image);
        continue;
      }

      if (
        (!this.fetched && required) ||
        this.market_required_images.includes(image)
      ) {
        continue;
      }

      const hoursSinceLastUsed = hoursSinceDate(new Date(lastUsed));
      if (hoursSinceLastUsed > 24 || isPrivate) {
        await this.containerOrchestration.deleteImage(image);
        this.repository.deleteImageResource(image);
      }
    }
  }

  public async setImage(image: string, isPrivate = false): Promise<void> {
    const imageObj = this.repository.getImageResource(image);
    this.repository.updateImageResource(image, {
      lastUsed: new Date(),
      usage: imageObj?.usage + 1 || 1,
      isPrivate,
    });
  }
}
