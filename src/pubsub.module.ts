import { Module, DynamicModule, Provider, Global, Logger } from "@nestjs/common";
import { PubSub } from "@google-cloud/pubsub";
import { DiscoveryModule } from "@nestjs/core";

import { PubsubPublisher } from "./pubsub-publisher.service";
import { PubSubExplorer } from "./pubsub-explorer.service";
import { PUBSUB_CLIENT, PUBSUB_LOGGER, PUBSUB_MERGED_OPTIONS } from "./constants";
import { 
  PubsubCloudOptions, 
  PubsubConfigOptions, 
  PubsubModuleAsyncOptions, 
  PubsubOptionsFactory 
} from "./pubsub.types";

@Global()
@Module({
  imports: [DiscoveryModule],
})
export class PubsubModule {

  private static readonly libraryExports = [
    PubsubPublisher, 
    PUBSUB_CLIENT, 
    PUBSUB_LOGGER, 
    PUBSUB_MERGED_OPTIONS
  ];

  private static readonly coreProviders = [PubsubPublisher, PubSubExplorer];

  static register(options: PubsubConfigOptions): DynamicModule {
    const mergedOptions = this.mergeDefaultOptions(options);

    return {
      module: PubsubModule,
      providers: [
        { provide: PUBSUB_MERGED_OPTIONS, useValue: mergedOptions },
        this.createLoggerProvider(mergedOptions),
        {
          provide: PUBSUB_CLIENT,
          useFactory: () => this.createClient(mergedOptions),
        },
        ...this.coreProviders,
      ],
      exports: this.libraryExports,
    };
  }

  static registerAsync(options: PubsubModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);

    return {
      module: PubsubModule,
      imports: options.imports || [],
      providers: [
        ...asyncProviders,
        this.createLoggerProvider(),
        {
          provide: PUBSUB_CLIENT,
          useFactory: (config: Required<PubsubConfigOptions>) => this.createClient(config),
          inject: [PUBSUB_MERGED_OPTIONS],
        },
        ...this.coreProviders,
      ],
      exports: this.libraryExports,
    };
  }

  private static createLoggerProvider(options?: Required<PubsubConfigOptions>): Provider {
    if (options) {
      return {
        provide: PUBSUB_LOGGER,
        useValue: options.logger || new Logger('PubsubModule'),
      };
    }

    return {
      provide: PUBSUB_LOGGER,
      useFactory: (config: Required<PubsubConfigOptions>) => {
        return config.logger || new Logger('PubsubModule');
      },
      inject: [PUBSUB_MERGED_OPTIONS],
    };
  }

  private static createAsyncProviders(options: PubsubModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      const { useFactory } = options;
      return [{
        provide: PUBSUB_MERGED_OPTIONS,
        useFactory: async (...args: any[]) => {
          const config = await useFactory(...args);
          return this.mergeDefaultOptions(config);
        },
        inject: options.inject || [],
      }];
    }

    const injectToken = options.useClass || options.useExisting;
    if (!injectToken) {
      throw new Error('PubsubModule: Invalid configuration. Provide useFactory, useClass, or useExisting');
    }

    const providers: Provider[] = [
      {
        provide: PUBSUB_MERGED_OPTIONS,
        useFactory: async (factory: PubsubOptionsFactory) => {
          const config = await factory.createPubsubOptions();
          return this.mergeDefaultOptions(config);
        },
        inject: [injectToken],
      },
    ];

    if (options.useClass) {
      providers.push({
        provide: options.useClass,
        useClass: options.useClass,
      });
    }
  
    return providers;
  }

  private static mergeDefaultOptions(options: PubsubConfigOptions): Required<PubsubConfigOptions> {
    return {
      emulatorMode: false,
      autoCreateTopics: false,
      ...options,
    } as Required<PubsubConfigOptions>;
  }

  private static createClient(options: PubsubConfigOptions): PubSub {
    if (options.emulatorMode) {
      if (!options.port) {
        throw new Error('PubsubModule: Emulator mode requires a port.');
      }
      return new PubSub({
        projectId: options.projectId,
        apiEndpoint: `localhost:${options.port}`,
      });
    }

    const { projectId, keyFilename, credentials } = options as PubsubCloudOptions;

    return new PubSub({
      projectId,
      keyFilename,
      credentials,
    });
  }
}
