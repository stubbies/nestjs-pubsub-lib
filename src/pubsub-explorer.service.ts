import { Injectable, OnModuleInit, Inject, OnModuleDestroy, LoggerService } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { PubSub, Message, CreateSubscriptionOptions, Topic, Subscription } from '@google-cloud/pubsub';
import { PUBSUB_CLIENT, PUBSUB_LOGGER, PUBSUB_MERGED_OPTIONS, PUBSUB_LISTENER_METADATA } from './constants';
import { PubsubConfigOptions, PubSubListenerOptions } from './pubsub.types';
import { normalizeError } from './error.utils';

@Injectable()
export class PubSubExplorer implements OnModuleInit, OnModuleDestroy {
    private subscriptions: Subscription[] = [];

    private readonly defaultSubscriptionOptions: CreateSubscriptionOptions = {
        ackDeadlineSeconds: 60,
        retryPolicy: {
            minimumBackoff: { seconds: 10 },
            maximumBackoff: { seconds: 600 },
        },
        messageRetentionDuration: { seconds: 86400 * 7 }, // 7 days
    };

    constructor(
        private readonly discoveryService: DiscoveryService,
        private readonly reflector: Reflector,
        @Inject(PUBSUB_CLIENT) private readonly pubSub: PubSub,
        @Inject(PUBSUB_LOGGER) private readonly logger: LoggerService,
        @Inject(PUBSUB_MERGED_OPTIONS) private readonly options: Required<PubsubConfigOptions>,
    ) { }

    async onModuleInit() {
        const providers = this.discoveryService.getProviders();

        for (const wrapper of providers) {
            const { instance } = wrapper;
            if (!instance || !instance.constructor) continue;

            const metadata = this.reflector.get<PubSubListenerOptions>(
                PUBSUB_LISTENER_METADATA,
                instance.constructor,
            );

            if (metadata) {
                await this.setupHandler(instance, metadata);
            }
        }
    }

    private async getOrCreateTopic(meta: PubSubListenerOptions): Promise<Topic> {
        const topic = this.pubSub.topic(meta.topicName);

        const [topicExists] = await topic.exists();
        if (!topicExists) {
            if (this.options.autoCreateTopics) {
                this.logger.warn(
                    `Topic '${meta.topicName}' does not exist. Auto-creating...`,
                    this.constructor.name
                );
                await topic.create();
                this.logger.log(
                    `Topic '${meta.topicName}' created.`,
                    this.constructor.name
                );
            } else {
                throw new Error(
                    `Topic '${meta.topicName}' does not exist and auto-creation is disabled. Cannot start listener.`
                );
            }
        }
        return topic;
    }

    private async getOrCreateSubscription(topic: Topic, meta: PubSubListenerOptions): Promise<Subscription> {
        const subscription = topic.subscription(meta.subscriptionName);
        const [subscriptionExists] = await subscription.exists();

        if (!subscriptionExists) {
            const mergedOptions: CreateSubscriptionOptions = {
                ...this.defaultSubscriptionOptions,
                ...meta.subscriptionOptions,
                retryPolicy: {
                    ...this.defaultSubscriptionOptions.retryPolicy,
                    ...(meta.subscriptionOptions?.retryPolicy || {}),
                },
            };

            this.logger.log(`Creating subscription ${meta.subscriptionName} with merged options...`);
            await subscription.create(mergedOptions);
        }
        return subscription;
    }

    private async setupHandler(instance: any, meta: PubSubListenerOptions) {
        try {
            this.logger.log(
                `Setting up subscription '${meta.subscriptionName}' for topic '${meta.topicName}'`
            );

            const topic = await this.getOrCreateTopic(meta);
            const subscription = await this.getOrCreateSubscription(topic, meta);
            subscription.on('message', async (message: Message) => {
                try {
                    const payload = JSON.parse(message.data.toString());
                    await instance.handle(payload, message);
                } catch (err: unknown) {
                    const normalizedError = normalizeError(err);
                    this.logger.error(
                        `Handler ${instance.constructor.name} failed: ${normalizedError.message}`,
                        normalizedError.stack,
                        this.constructor.name
                    );
                    message.nack();
                }
            });

            this.subscriptions.push(subscription);
            this.logger.log(`Mapped handler ${instance.constructor.name} to ${meta.subscriptionName}`);
        } catch (error: unknown) {
            const normalizedError = normalizeError(error);
            this.logger.error(
                `Fatal error during listener setup for topic '${meta.topicName}'`,
                normalizedError.stack,
                this.constructor.name
            );
            throw error;
        }
    }

    onModuleDestroy() {
        this.subscriptions.forEach(sub => sub.close());
    }
}