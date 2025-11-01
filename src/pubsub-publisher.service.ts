import { PubSub, Topic } from "@google-cloud/pubsub";
import { Inject, Injectable, LoggerService } from "@nestjs/common";
import {
  PUBSUB_CLIENT,
  PUBSUB_LOGGER,
  PUBSUB_MERGED_OPTIONS,
} from "./constants";
import { PubsubConfigOptions } from "./pubsub.types";
import { normalizeError } from "./error.utils";

@Injectable()
export class PubsubPublisher {
  constructor(
    @Inject(PUBSUB_CLIENT) private readonly pubSubClient: PubSub,
    @Inject(PUBSUB_LOGGER) private readonly logger: LoggerService,
    @Inject(PUBSUB_MERGED_OPTIONS)
    private readonly options: Required<PubsubConfigOptions>
  ) {}

  async dispatchEvent<T>(
    topicName: string,
    data: T,
    options?: {
      attributes?: Record<string, string>;
      /**
       * For development/debugging only.
       * If true, the full data payload will be logged.
       * Do not enable this in production.
       */
      logPayload?: boolean;
    }
  ): Promise<string> {
    const dataBuffer = Buffer.from(JSON.stringify(data));
    const attributes = options?.attributes || {};

    const logMetadata = {
      topicName,
      attributes,
      payloadSize: dataBuffer.byteLength,
    };

    const logObject =
      options?.logPayload === true
        ? { ...logMetadata, payload: data }
        : logMetadata;

    this.logger.log(`Dispatching event...`, PubsubPublisher.name, logObject);

    try {
      const topic = await this.getTopic(topicName);
      const messageId = await topic.publishMessage({
        data: dataBuffer,
        attributes,
      });

      this.logger.log(`Event dispatched successfully`, PubsubPublisher.name, {
        ...logObject,
        messageId,
      });
      return messageId;
    } catch (error) {
      const normalizedError = normalizeError(error);
      this.logger.error(
        `Failed to dispatch event`,
        normalizedError.stack,
        PubsubPublisher.name,
        logObject
      );
      throw error;
    }
  }

  private async getTopic(topicName: string): Promise<Topic> {
    const topic = this.pubSubClient.topic(topicName);
    const [exists] = await topic.exists();

    if (!exists) {
      if (this.options.autoCreateTopics) {
        this.logger.warn(
          `Topic '${topicName}' does not exist. Auto-creating...`,
          PubsubPublisher.name
        );
        await topic.create();
        this.logger.log(
          `Topic '${topicName}' created successfully.`,
          PubsubPublisher.name
        );
      } else {
        throw new Error(
          `Topic '${topicName}' does not exist and auto-creation is disabled.`
        );
      }
    }
    return topic;
  }
}
