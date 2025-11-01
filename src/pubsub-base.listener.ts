import {
  PubSub,
  Message,
  Subscription,
  CreateSubscriptionOptions,
} from "@google-cloud/pubsub";
import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from "@nestjs/common";
import {
  PUBSUB_CLIENT,
  PUBSUB_LOGGER,
  PUBSUB_MERGED_OPTIONS,
} from "./constants";
import { PubsubConfigOptions } from "./pubsub.types";
import { normalizeError } from "./error.utils";

@Injectable()
export abstract class PubsubBaseListener<T = unknown> implements OnModuleInit {
  abstract readonly topicName: string;
  abstract readonly subscriptionName: string;

  protected readonly subscriptionOptions?: CreateSubscriptionOptions;

  constructor(
    @Inject(PUBSUB_CLIENT) protected readonly pubSubClient: PubSub,
    @Inject(PUBSUB_MERGED_OPTIONS)
    protected readonly options: Required<PubsubConfigOptions>,
    @Inject(PUBSUB_LOGGER) protected readonly logger: LoggerService
  ) {}

  /**
   * Handles the successfully parsed and typed message payload.
   * @param payload The JSON-parsed and strongly-typed message data.
   * @param message The original Pub/Sub message, for access to attributes or ack/nack.
   */
  abstract handlePayload(payload: T, message: Message): Promise<void>;

  async onModuleInit() {
    try {
      this.logger.log(
        `Setting up subscription '${this.subscriptionName}' for topic '${this.topicName}'`
      );
      const topic = this.pubSubClient.topic(this.topicName);

      const [topicExists] = await topic.exists();
      if (!topicExists) {
        if (this.options.autoCreateTopics) {
          this.logger.warn(
            `Topic '${this.topicName}' does not exist. Auto-creating...`,
            this.constructor.name
          );
          await topic.create();
          this.logger.log(
            `Topic '${this.topicName}' created.`,
            this.constructor.name
          );
        } else {
          throw new Error(
            `Topic '${this.topicName}' does not exist and auto-creation is disabled. Cannot start listener.`
          );
        }
      }

      const subscription = topic.subscription(this.subscriptionName);
      const [subscriptionExists] = await subscription.exists();

      if (!subscriptionExists) {
        const options = this.getMergedSubscriptionOptions();
        await subscription.create(options);
        this.logger.log(
          `Subscription ${
            this.subscriptionName
          } created with options: ${JSON.stringify(options)}`
        );
      }

      this.listenForMessages(subscription);
    } catch (error) {
      const normalizedError = normalizeError(error);
      this.logger.error(
        `Fatal error during listener setup for topic '${this.topicName}'`,
        normalizedError.stack,
        this.constructor.name
      );
      throw error;
    }
  }

  private async onMessage(message: Message): Promise<void> {
    let parsedPayload: T;
    try {
      parsedPayload = this.parsePayload(message.data);
    } catch (error) {
      const normalizedError = normalizeError(error);
      this.logger.error(
        'Failed to parse Pub/Sub message data. Message will be nacked.',
        normalizedError.stack,
        this.constructor.name,
      );
      message.nack();
      return;
    }

    try {
      await this.handlePayload(parsedPayload, message);
    } catch (error) {
      const normalizedError = normalizeError(error);
      this.logger.error(
        `Error handling message: ${normalizedError.message}`,
        normalizedError.stack,
        this.constructor.name,
      );
      message.nack();
    }
  }

  private listenForMessages(subscription: Subscription) {
    subscription.on("message", async (message: Message) => {
      try {
        await this.onMessage(message);
        // await this.handleMessage(message);
      } catch (error) {
        this.logger.error(`Error handling message ${message.id}:`, error);
        message.nack();
      }
    });

    subscription.on("error", (error) => {
      this.logger.error(
        `Subscription ${this.subscriptionName} encountered an error:`,
        error
      );
    });

    this.logger.log(
      `Listener started for subscription: ${this.subscriptionName}`
    );
  }

  private getMergedSubscriptionOptions(): CreateSubscriptionOptions {
    const defaultOptions: CreateSubscriptionOptions = {
      ackDeadlineSeconds: 60, // Default to 60 seconds
      retryPolicy: {
        minimumBackoff: { seconds: 10 }, // Default to 10s backoff
        maximumBackoff: { seconds: 600 },
      },
      messageRetentionDuration: { seconds: 86400 * 7 }, // 7 days
    };

    return {
      ...defaultOptions,
      ...(this.subscriptionOptions ?? {}),
      retryPolicy: {
        ...defaultOptions.retryPolicy,
        ...(this.subscriptionOptions?.retryPolicy ?? {}),
      },
    };
  }

  protected parsePayload(data: Buffer): T {
    return JSON.parse(data.toString("utf-8"));
  }
}
