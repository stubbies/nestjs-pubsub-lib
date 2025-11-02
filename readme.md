<div align="center">

# NestJS Pub/Sub

**A robust, type-safe, and production-ready Google Pub/Sub module for NestJS.**

</div>

<p align="center">
  <a href="https://www.npmjs.com/package/nestjs-pubsub-lib"><img src="https://img.shields.io/npm/v/nestjs-pubsub-lib" alt="NPM Version"/></a>
  <a href="https://www.npmjs.com/package/nestjs-pubsub-lib"><img src="https://img.shields.io/npm/l/nestjs-pubsub-lib
" alt="Package License"/></a>
</p>

A fully-featured NestJS module for Google Cloud Pub/Sub that provides a simple, declarative, and type-safe way to publish and subscribe to events. Designed with best practices in mind, it handles boilerplate, configuration, and error handling so you can focus on your business logic.

## ✨ Features

-   **Type-Safe Listeners:** Use generics to automatically parse and type your message payloads.
-   **Configurable:** Easily switch between the Pub/Sub emulator for local development and the real GCP for production.
-   **Sensible Defaults:** Safe-by-default options, like disabled auto-creation of topics in production.
-   **Dependency Injection:** Integrates seamlessly with the NestJS DI container.
-   **Customizable Logging:** Integrates with your application's logger (`LoggerService`).
-   **Error Handling:** Centralized handling for JSON parsing errors and business logic exceptions.
-   **Advanced Access:** Provides an "escape hatch" to access the raw Google `PubSub` client for complex use cases.

## 🚀 Installation

```bash
npm install nestjs-pubsub-lib @google-cloud/pubsub
# or
yarn add nestjs-pubsub-lib @google-cloud/pubsub
```

## 🔑 Authentication
By default, this library uses Application Default Credentials (ADC), which is the recommended approach when running your application on Google Cloud services like Cloud Run, GKE, or Compute Engine.
For applications running outside of GCP, you must provide credentials manually.

### Using a Service Account Key File
You can provide the path to a service account JSON file.

```typescript
PubsubModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    projectId: config.get('GCP_PROJECT_ID'),
    credentials: {
      client_email: config.get('GCP_CLIENT_EMAIL'),
      private_key: config.get<string>('GCP_PRIVATE_KEY').replace(/\\n/g, '\n'),
    },
  }),
})
```

## 🏁 Getting Started: Local Development with the Emulator

This guide will get you up and running in minutes using the Google Cloud Pub/Sub Emulator.

### 1. Run the Pub/Sub Emulator

Make sure you have the [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed. Then, start the emulator:

```bash
gcloud beta emulators pubsub start --project=your-local-project-id
```

The emulator will print its host and port (e.g., `localhost:8681`).

### 2. Register the Module

Import `PubsubModule` into your `AppModule` and configure it to connect to the emulator.

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { PubsubModule } from 'nestjs-pubsub-lib';
import { UserCreatedListener } from './listeners/user-created.listener';
import { AppController } from './app.controller';

@Module({
  imports: [
    PubsubModule.register({
      projectId: 'your-local-project-id', // The project ID for the emulator
      emulatorMode: true, // Enable emulator mode
      port: 8681,         // The port the emulator is running on
      autoCreateTopics: true, // Convenient for local development
    }),
  ],
  controllers: [AppController],
  providers: [UserCreatedListener], // Register your listener
})
export class AppModule {}
```

### 3. Create a Type-Safe Listener

Define a DTO for your event payload and create a listener that extends the generic `PubsubBaseListener<T>`.

**Payload DTO:**
```typescript
// src/dto/user-created.payload.ts
export interface UserCreatedPayload {
  userId: string;
  email: string;
}
```

**Listener Implementation:**
```typescript
// src/listeners/user-created.listener.ts
import { Injectable } from '@nestjs/common';
import { Message } from '@google-cloud/pubsub';
import { PubsubBaseListener } from 'nestjs-pubsub-lib';
import { UserCreatedPayload } from '../dto/user-created.payload';

@Injectable()
export class UserCreatedListener extends PubsubBaseListener<UserCreatedPayload> {
  readonly topicName = 'user.created';
  readonly subscriptionName = 'notification-service.user.created';

  async handlePayload(payload: UserCreatedPayload, message: Message): Promise<void> {
    this.logger.log(`Received user created event for user: ${payload.userId}`);
    // `payload` is fully typed!
    // ... send a welcome email ...
    message.ack();
  }
}
```

### 4. Publish an Event

Inject the `PubsubPublisher` into any service and use the `dispatchEvent` method.

```typescript
// src/app.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { PubsubPublisher } from 'nestjs-pubsub-lib';
import { UserCreatedPayload } from './dto/user-created.payload';

@Controller()
export class AppController {
  constructor(private readonly publisher: PubsubPublisher) {}

  @Post('/users')
  async createUser(@Body() userData: UserCreatedPayload) {
    // ... save user to database ...

    await this.publisher.dispatchEvent('user.created', userData, {
      attributes: { source: 'api-gateway' },
    });
    
    return { status: 'User created and event published!' };
  }
}
```

That's it! When you call the `/users` endpoint, the `UserCreatedListener` will receive and process the event.

---

## ⚙️ Configuration

The module is configured via the `register()` or `registerAsync()` method.

| Option             | Type                        | Default                               | Description                                                                                                                              |
| ------------------ | --------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `projectId`        | `string`                    | **Required**                          | Your Google Cloud project ID.                                                                                                            |
| `emulatorMode`     | `boolean`                   | `false`                               | If `true`, connects to the Pub/Sub emulator. `port` is required.                                                                         |
| `port`             | `number`                    | `undefined`                           | The port of the Pub/Sub emulator. **Required** if `emulatorMode` is `true`.                                                              |
| `autoCreateTopics` | `boolean`                   | `true`                                | If `true`, topics will be created automatically. **It is strongly recommended to set this to `false` in production.**                 |
| `logger`           | `LoggerService`             | `new Logger('PubsubModule')`          | A custom logger instance that conforms to NestJS's `LoggerService` interface.                                                            |
| `keyFilename`           | `string`             | `undefined`          |
| `credentials`           | `{ client_email: string, private_key: string }`             | `undefined`          |


### Production Configuration (Without Emulator)

For production, simply omit the emulator options. It's also highly recommended to use `registerAsync` to pull configuration from a `ConfigService`.

```typescript
// src/app.module.ts
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PubsubModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        projectId: configService.get('GCP_PROJECT_ID'),
        // In production, you manage topics with IaC (e.g., Terraform)
        autoCreateTopics: false, 
        // Only log important messages in production
        logLevel: ['warn', 'error'],
      }),
    }),
    // ... other modules
  ],
})
export class AppModule {}
```

## Advanced Usage

### Setting Custom Subscription Options

You can specify detailed subscription options (e.g., retry policies, acknowledgment deadlines) directly in your listener by defining the `subscriptionOptions` property.

```typescript
// src/listeners/payment-processed.listener.ts
import { CreateSubscriptionOptions } from '@google-cloud/pubsub';

@Injectable()
export class PaymentProcessedListener extends PubsubBaseListener<PaymentPayload> {
  readonly topicName = 'payment.processed';
  readonly subscriptionName = 'reporting-service.payment.processed';

  // Define custom options for this specific subscription
  protected readonly subscriptionOptions: CreateSubscriptionOptions = {
    ackDeadlineSeconds: 300, // 5 minutes to process
    retryPolicy: {
      minimumBackoff: { seconds: 15 },
      maximumBackoff: { seconds: 300 },
    },
    // For a full list of options, see the official Google Cloud documentation.
  };

  async handlePayload(payload: PaymentPayload, message: Message): Promise<void> {
    // ... long-running reporting logic ...
    message.ack();
  }
}
```

### Accessing the Raw `PubSub` Client

For advanced use cases not covered by the `PubsubPublisher` or `PubsubBaseListener`, you can inject the raw, singleton `PubSub` client instance directly into any service.

```typescript
// src/advanced.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import { PUB_SUB_CLIENT } from 'nestjs-pubsub-lib'; // Import the injection token

@Injectable()
export class AdvancedService {
  constructor(
    @Inject(PUB_SUB_CLIENT) private readonly pubSubClient: PubSub,
  ) {}

  async createTemporarySubscription(userId: string): Promise<void> {
    // Use the raw client for operations not in the library's abstractions
    const topic = this.pubSubClient.topic('user-specific-notifications');
    const subscriptionName = `temp-sub-for-user-${userId}`;

    await topic.createSubscription(subscriptionName, {
      expirationPolicy: { ttl: { seconds: 3600 } }, // Expires in 1 hour
    });

    this.logger.log(`Created temporary subscription for user ${userId}`);
  }
}
```

## License

This library is [MIT licensed](LICENSE).



