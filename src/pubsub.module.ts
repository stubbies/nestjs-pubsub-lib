import { Module, DynamicModule, Provider, Logger } from "@nestjs/common";
import { PubsubPublisher } from "./pubsub-publisher.service";
import { PubsubConfigOptions } from "./pubsub.types";
import {
  PUBSUB_CLIENT,
  PUBSUB_LOGGER,
  PUBSUB_MERGED_OPTIONS,
} from "./constants";
import { PubSub } from "@google-cloud/pubsub";

@Module({})
export class PubsubModule {
  static register(options: PubsubConfigOptions): DynamicModule {
    const mergedOptions: PubsubConfigOptions = {
      emulatorMode: false,
      autoCreateTopics: false,
      ...options,
      logger: options.logger || new Logger("PubsubModule"),
    };

    const pubSubClientProvider: Provider = {
      provide: PUBSUB_CLIENT,
      useFactory: () => {
        if (mergedOptions.emulatorMode) {
          return new PubSub({
            emulatorMode: true,
            port: mergedOptions.port,
            projectId: mergedOptions.projectId,
          });
        }

        const cloudOptions: PubsubConfigOptions = {
          projectId: mergedOptions.projectId,
        };

        if ('keyFilename' in mergedOptions && mergedOptions.keyFilename) {
          cloudOptions.keyFilename = mergedOptions.keyFilename;
        } else if ('credentials' in mergedOptions && mergedOptions.credentials) {
          cloudOptions.credentials = mergedOptions.credentials;
        }

        return new PubSub(cloudOptions);
      },
    };

    const loggerProvider: Provider = {
      provide: PUBSUB_LOGGER,
      useValue: mergedOptions.logger,
    };

    const mergedOptionsProvider: Provider = {
      provide: PUBSUB_MERGED_OPTIONS,
      useValue: mergedOptions,
    };

    return {
      module: PubsubModule,
      providers: [
        pubSubClientProvider,
        loggerProvider,
        mergedOptionsProvider,
        PubsubPublisher,
      ],
      exports: [
        PubsubPublisher,
        PUBSUB_CLIENT,
        PUBSUB_LOGGER,
        PUBSUB_MERGED_OPTIONS,
      ],
    };
  }
}
