import {
  Message,
  CreateSubscriptionOptions,
} from "@google-cloud/pubsub";
import { LoggerService, ModuleMetadata, Type } from "@nestjs/common";

export type PubsubMessage = Message;

export type PubsubOptionsBase = {
  projectId: string;
  logger?: LoggerService;
  /**
   * If true, topics will be created automatically if they do not exist.
   * @default false
   */
  autoCreateTopics?: boolean;
};

export interface PubsubEmulatorOptions extends PubsubOptionsBase {
  emulatorMode: true;
  port: number;
}

export interface PubsubCloudOptions extends PubsubOptionsBase {
  emulatorMode?: false;
  /**
   * The full path to a GCP service account key file (JSON).
   * If provided, this will be used for authentication instead of Application Default Credentials.
   */
  keyFilename?: string;
  /**
   * If provided, this will be used instead of Application Default Credentials.
   */
  credentials?: {
    client_email: string;
    private_key: string;
  };
}

export type PubsubConfigOptions = PubsubEmulatorOptions | PubsubCloudOptions;

export interface PubSubListenerOptions {
  topicName: string;
  subscriptionName: string;
  subscriptionOptions?: CreateSubscriptionOptions;
}

export interface PubsubOptionsFactory {
  createPubsubOptions(): Promise<PubsubConfigOptions> | PubsubConfigOptions;
}

export interface PubsubModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Use an existing provider that implements PubsubOptionsFactory.
   */
  useExisting?: Type<PubsubOptionsFactory>;

  /**
   * Instantiate a new provider that implements PubsubOptionsFactory.
   */
  useClass?: Type<PubsubOptionsFactory>;

  /**
   * A factory function that returns the PubsubConfigOptions.
   */
  useFactory?: (...args: any[]) => Promise<PubsubConfigOptions> | PubsubConfigOptions;

  /**
   * Dependencies to inject into the factory function.
   */
  inject?: any[];
}
