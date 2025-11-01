import { Injectable, LoggerService } from "@nestjs/common";
import { PubsubBaseListener } from "./pubsub-base.listener";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { Message, PubSub, Subscription, Topic } from "@google-cloud/pubsub";
import { Test } from "@nestjs/testing";
import { mockResolve, mockReturn } from "./test.utils";
import { PubsubEmulatorOptions } from "./pubsub.types";
import { PUBSUB_CLIENT, PUBSUB_LOGGER, PUBSUB_MERGED_OPTIONS } from "./constants";

interface TestPayload {
  hello: string;
}

@Injectable()
class TestListener extends PubsubBaseListener<unknown> {
  readonly topicName = "test-topic";
  readonly subscriptionName = "test-sub";

  handlePayload = jest.fn();
}

describe("PubsubBaseListener", () => {
  let listener: TestListener;
  let mockPubSubClient: DeepMockProxy<PubSub>;
  let mockLogger: DeepMockProxy<LoggerService>;
  let mockOptions: Required<PubsubEmulatorOptions>;

  beforeEach(async () => {
    mockPubSubClient = mockDeep<PubSub>();
    mockLogger = mockDeep<LoggerService>();
    mockOptions = {
      projectId: "test-project",
      autoCreateTopics: true,
      emulatorMode: true,
      port: 8080,
      logger: mockLogger,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TestListener,
        { provide: PUBSUB_CLIENT, useValue: mockPubSubClient },
        { provide: PUBSUB_LOGGER, useValue: mockLogger },
        { provide: PUBSUB_MERGED_OPTIONS, useValue: mockOptions },
      ],
    }).compile();
    listener = moduleRef.get(TestListener);
  });

  it("should create subscription onModuleInit if it does not exist", async () => {
    const mockSubscription = mockDeep<Subscription>();
    const mockTopic = mockDeep<Topic>();
    mockReturn(mockPubSubClient.topic, mockTopic);
    mockReturn(mockTopic.subscription, mockSubscription);
    mockResolve(mockTopic.exists, [true]);
    mockResolve(mockSubscription.exists, [false]);
    await listener.onModuleInit();
    expect(mockSubscription.create).toHaveBeenCalled();
  });

  it("should parse a message and call handlePayload on success", async () => {
    const mockSubscription = mockDeep<Subscription>();
    const mockTopic = mockDeep<Topic>();
    mockReturn(mockPubSubClient.topic, mockTopic);
    mockReturn(mockTopic.subscription, mockSubscription);
    mockResolve(mockTopic.exists, [true]);
    mockResolve(mockSubscription.exists, [true]);

    let capturedMessageHandler: ((message: Message) => Promise<void>) | null = null;
    (mockSubscription.on as jest.Mock).mockImplementation(
      (event: string, handler: (message: Message) => Promise<void>) => {
        if (event === 'message') {
          capturedMessageHandler = handler;
        }
        return mockSubscription;
      }
    );

    await listener.onModuleInit();

    if (!capturedMessageHandler) {
      throw new Error("Test setup failed: The 'message' event handler was not captured.");
    }

    const messageHandler = capturedMessageHandler as (message: Message) => Promise<void>;
    
    const expectedPayload: TestPayload = { hello: 'world' };

    const fakeMessage = {
      id: 'msg-1',
      data: Buffer.from(JSON.stringify(expectedPayload)),
      ack: jest.fn(),
      nack: jest.fn(),
      attributes: { traceId: '123' },
      publishTime: new Date(),
    } as unknown as Message;

    (listener.handlePayload as jest.Mock).mockImplementation(async (payload, message) => {
      message.ack();
    });

    await messageHandler(fakeMessage);

    expect(listener.handlePayload).toHaveBeenCalledWith(expectedPayload, fakeMessage);
    expect(fakeMessage.ack).toHaveBeenCalled();
    expect(fakeMessage.nack).not.toHaveBeenCalled();
  });
  it('should nack the message if the payload is malformed JSON', async () => {
    const mockSubscription = mockDeep<Subscription>();
    const mockTopic = mockDeep<Topic>();
    mockReturn(mockPubSubClient.topic, mockTopic);
    mockReturn(mockTopic.subscription, mockSubscription);
    mockResolve(mockTopic.exists, [true]);
    mockResolve(mockSubscription.exists, [true]);

    let capturedMessageHandler: ((message: Message) => Promise<void>) | null = null;
    (mockSubscription.on as jest.Mock).mockImplementation(
      (event: string, handler: (message: Message) => Promise<void>) => {
        if (event === 'message') {
          capturedMessageHandler = handler;
        }
        return mockSubscription;
      }
    );

    await listener.onModuleInit();

    if (!capturedMessageHandler) {
      throw new Error("Handler not captured");
    }

    const messageHandler = capturedMessageHandler as (message: Message) => Promise<void>;

    const fakeMessage = {
      id: 'msg-2',
      data: Buffer.from('{ "this is not valid json" }'), // Invalid JSON
      ack: jest.fn(),
      nack: jest.fn(),
    } as unknown as Message;

    await messageHandler(fakeMessage);

    expect(listener.handlePayload).not.toHaveBeenCalled();
    expect(fakeMessage.nack).toHaveBeenCalled();
    expect(fakeMessage.ack).not.toHaveBeenCalled();
  });

  it('should nack the message if handlePayload throws an error', async () => {
    const mockSubscription = mockDeep<Subscription>();
    const mockTopic = mockDeep<Topic>();
    mockReturn(mockPubSubClient.topic, mockTopic);
    mockReturn(mockTopic.subscription, mockSubscription);
    mockResolve(mockTopic.exists, [true]);
    mockResolve(mockSubscription.exists, [true]);

    let capturedMessageHandler: ((message: Message) => Promise<void>) | null = null;
    (mockSubscription.on as jest.Mock).mockImplementation(
      (event: string, handler: (message: Message) => Promise<void>) => {
        if (event === 'message') {
          capturedMessageHandler = handler;
        }
        return mockSubscription;
      }
    );

    await listener.onModuleInit();

    if (!capturedMessageHandler) {
      throw new Error("Handler not captured");
    }

    const messageHandler = capturedMessageHandler as (message: Message) => Promise<void>;
    
    const businessError = new Error('Something went wrong in the business logic');
    const expectedPayload = { hello: 'world' };
    const fakeMessage = {
      id: 'msg-3',
      data: Buffer.from(JSON.stringify(expectedPayload)),
      ack: jest.fn(),
      nack: jest.fn(),
    } as unknown as Message;

    (listener.handlePayload as jest.Mock).mockRejectedValue(businessError);

    await messageHandler(fakeMessage);
    
    expect(listener.handlePayload).toHaveBeenCalledWith(expectedPayload, fakeMessage);
    expect(fakeMessage.nack).toHaveBeenCalled();
    expect(fakeMessage.ack).not.toHaveBeenCalled();
  });
});
