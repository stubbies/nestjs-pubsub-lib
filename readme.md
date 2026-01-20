# NestJS Pub/Sub

**A robust, type-safe, and production-ready Google Pub/Sub module for NestJS.**

<p align="center">
  <a href="https://www.npmjs.com/package/nestjs-pubsub-lib"><img src="https://img.shields.io/npm/v/nestjs-pubsub-lib" alt="NPM Version"/></a>
  <a href="https://www.npmjs.com/package/nestjs-pubsub-lib"><img src="https://img.shields.io/npm/l/nestjs-pubsub-lib" alt="Package License"/></a>
</p>

A fully-featured NestJS module for Google Cloud Pub/Sub that provides a declarative, decorator-based way to subscribe to events. Designed for high-scale production environments, it handles infrastructure boilerplate, configuration, and error handling so you can focus on business logic.

## ✨ Features

-   **Zero Inheritance:** No `extends PubsubBaseListener`. Use the `@PubSubListener()` decorator on any class.
-   **Discovery Pattern:** Automated registration. Just add the decorator and the module finds it.
-   **Clean Dependency Injection:** Injected services (like `ConfigService` or `TypeORM`) work exactly as they do in any other Nest service.
-   **Type-Safe Payloads:** Automatic JSON parsing of incoming messages.
-   **Production Ready:** Built-in merging for global defaults and listener-specific subscription options (retry policies, ack deadlines).
-   **Emulator Support:** seamless switching between local development and GCP.

## Installation

```bash
npm install nestjs-pubsub-lib @google-cloud/pubsub
```

You're right, I focused so much on the new Decorator pattern that I buried the authentication details. For a library used by companies, the **Authentication** section is the most important part of the README after installation.

Here is the revised **Authentication** and **Configuration Options** section for your README.

---

## Authentication

By default, this library uses **Application Default Credentials (ADC)**. This is the recommended approach when running on Google Cloud (Cloud Run, GKE, App Engine).

### For Non-GCP Environments (AWS, On-Prem, Local)

If you are hosting outside of Google Cloud, you must provide a Service Account key. You can do this in two ways:

#### 1. Using a Key File Path
```typescript
PubsubModule.register({
  projectId: 'my-project-id',
  keyFilename: '/path/to/service-account.json',
});
```

#### 2. Using Direct Credentials (Recommended for Docker/CI)
When using environment variables, ensure you handle the private key newline characters correctly.

```typescript
PubsubModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    projectId: config.get('GCP_PROJECT_ID'),
    credentials: {
      client_email: config.get('GCP_CLIENT_EMAIL'),
      // Important: replace escaped newlines
      private_key: config.get<string>('GCP_PRIVATE_KEY').replace(/\\n/g, '\n'),
    },
  }),
});
```

## Getting Started

### 1. Register the Module

```typescript
// src/app.module.ts
import { PubsubModule } from 'nestjs-pubsub-lib';

@Module({
  imports: [
    PubsubModule.register({
      projectId: 'my-project-id',
      autoCreateTopics: true, // Auto-create infrastructure (useful for local/dev)
    }),
  ],
})
export class AppModule {}
```

### 2. Create a Listener

Simply mark any class with `@PubSubListener`. The library will automatically discover it and start the subscription.

```typescript
// src/listeners/user-created.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { Message } from '@google-cloud/pubsub';
import { PubSubListener } from 'nestjs-pubsub-lib';

@Injectable()
@PubSubListener({
  topicName: 'user.created',
  subscriptionName: 'notification-service.user.created',
})
export class UserCreatedListener {
  private readonly logger = new Logger(UserCreatedListener.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * Method called automatically when a message arrives.
   * payload is automatically parsed from JSON.
   */
  async handle(payload: { userId: string; email: string }, message: Message) {
    this.logger.log(`Processing user: ${payload.userId}`);
    
    await this.emailService.sendWelcome(payload.email);
    
    // Ack the message to remove it from the queue
    message.ack();
  }
}
```

### 3. Publish an Event

Inject `PubsubPublisher` into any service.

```typescript
@Injectable()
export class UserService {
  constructor(private readonly publisher: PubsubPublisher) {}

  async create(user: UserDto) {
    // ... logic ...
    await this.publisher.dispatchEvent('user.created', { 
      userId: user.id, 
      email: user.email 
    });
  }
}
```

---

## Configuration Overrides

Each `@PubSubListener` can override global settings like acknowledgment deadlines or retry policies.

```typescript
@PubSubListener({
  topicName: 'video.processing',
  subscriptionName: 'transcoder-sub',
  subscriptionOptions: {
    ackDeadlineSeconds: 600, // 10 minutes for long tasks
    retryPolicy: {
      minimumBackoff: { seconds: 30 },
      maximumBackoff: { seconds: 600 },
    },
  },
})
export class VideoListener {
  async handle(payload: any, message: Message) {
    // ... business logic ...
    message.ack();
  }
}
```

---

## Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `projectId` | `string` | **Required** | Your Google Cloud Project ID. |
| `emulatorMode` | `boolean` | `false` | Set to `true` to connect to a local Pub/Sub emulator. |
| `port` | `number` | `undefined` | The port of the emulator (Required if `emulatorMode` is `true`). |
| `autoCreateTopics` | `boolean` | `false` | If true, the library will create missing topics/subscriptions on startup. **Recommended: `true` for dev, `false` for prod.** |
| `keyFilename` | `string` | `undefined` | Full path to your GCP service account JSON file. |
| `credentials` | `object` | `undefined` | Object containing `client_email` and `private_key`. |
| `logger` | `LoggerService` | `Logger` | Custom logger (e.g., Winston, Pino). |

---

## Testing

The library is built for testability. Since listeners are plain NestJS classes, you can unit test them without any Pub/Sub infrastructure:

```typescript
describe('UserCreatedListener', () => {
  it('should send an email', async () => {
    const mockEmailService = { sendWelcome: jest.fn() };
    const listener = new UserCreatedListener(mockEmailService as any);
    const mockMessage = { ack: jest.fn() };

    await listener.handle({ userId: '1', email: 'test@test.com' }, mockMessage as any);

    expect(mockEmailService.sendWelcome).toHaveBeenCalledWith('test@test.com');
    expect(mockMessage.ack).toHaveBeenCalled();
  });
});
```

## Advanced: Accessing the Raw Client

If you need access to the underlying `@google-cloud/pubsub` client (e.g., for creating snapshots or managing IAM policies):

```typescript
import { PUBSUB_CLIENT } from 'nestjs-pubsub-lib';
import { PubSub } from '@google-cloud/pubsub';

@Injectable()
export class AdminService {
  constructor(@Inject(PUBSUB_CLIENT) private readonly pubSub: PubSub) {}
}
```

## License

MIT © [Stubbies](https://github.com/stubbies)