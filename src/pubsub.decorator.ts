import { SetMetadata } from '@nestjs/common';
import { CreateSubscriptionOptions } from '@google-cloud/pubsub';
import { PUBSUB_LISTENER_METADATA } from './constants';


export interface PubSubListenerOptions {
  topicName: string;
  subscriptionName: string;
  subscriptionOptions?: CreateSubscriptionOptions;
}

export const PubSubListener = (options: PubSubListenerOptions) => 
  SetMetadata(PUBSUB_LISTENER_METADATA, options);