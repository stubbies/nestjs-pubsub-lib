import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { LoggerService } from '@nestjs/common';
import { PubSub, Topic, Subscription, Message } from '@google-cloud/pubsub';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PubSubExplorer } from './pubsub-explorer.service';
import { mockResolve } from './test.utils';
import { 
  PUBSUB_CLIENT, 
  PUBSUB_LOGGER, 
  PUBSUB_MERGED_OPTIONS, 
} from './constants';
import { PubsubConfigOptions } from './pubsub.types';

describe('PubSubExplorer', () => {
    let explorer: PubSubExplorer;
    let reflector: Reflector;
    let discoveryService: DiscoveryService;
    
    let mockPubSub: DeepMockProxy<PubSub>;
    let mockLogger: DeepMockProxy<LoggerService>;
    let mockTopic: DeepMockProxy<Topic>;
    let mockSubscription: DeepMockProxy<Subscription>;
    let mockOptions: Required<PubsubConfigOptions>;
  
    beforeEach(async () => {
      mockPubSub = mockDeep<PubSub>();
      mockLogger = mockDeep<LoggerService>();
      mockTopic = mockDeep<Topic>();
      mockSubscription = mockDeep<Subscription>();
  
      mockOptions = {
        projectId: 'test-project',
        autoCreateTopics: true,
        emulatorMode: true,
        port: 8080,
        logger: mockLogger,
      };
  
      mockPubSub.topic.mockReturnValue(mockTopic);
      mockTopic.subscription.mockReturnValue(mockSubscription);
      mockResolve(mockTopic.exists, [true]);
      mockResolve(mockSubscription.exists, [true]);
  
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PubSubExplorer,
          DiscoveryService,
          Reflector,
          { provide: PUBSUB_CLIENT, useValue: mockPubSub },
          { provide: PUBSUB_LOGGER, useValue: mockLogger },
          { provide: PUBSUB_MERGED_OPTIONS, useValue: mockOptions },
        ],
      }).compile();
  
      explorer = module.get<PubSubExplorer>(PubSubExplorer);
      reflector = module.get<Reflector>(Reflector);
      discoveryService = module.get<DiscoveryService>(DiscoveryService);
    });

  it('should discover and setup handlers for decorated classes', async () => {
    class TestListener {
      handle = jest.fn();
    }
    const instance = new TestListener();

    jest.spyOn(discoveryService, 'getProviders').mockReturnValue([
      { instance, constructor: TestListener } as any,
    ]);

    jest.spyOn(reflector, 'get').mockReturnValue({
      topicName: 'test-topic',
      subscriptionName: 'test-sub',
      subscriptionOptions: { ackDeadlineSeconds: 30 },
    });

    await explorer.onModuleInit();

    expect(mockPubSub.topic).toHaveBeenCalledWith('test-topic');
    expect(mockTopic.subscription).toHaveBeenCalledWith('test-sub');
    expect(mockSubscription.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should auto-create topic if it does not exist and autoCreateTopics is enabled', async () => {
    mockResolve(mockTopic.exists, [false]);
    
    const instance = { handle: jest.fn() };
    jest.spyOn(discoveryService, 'getProviders').mockReturnValue([
      { instance, constructor: Object } as any,
    ]);
    jest.spyOn(reflector, 'get').mockReturnValue({
      topicName: 'new-topic',
      subscriptionName: 'new-sub',
    });

    await explorer.onModuleInit();

    expect(mockTopic.create).toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Topic 'new-topic' does not exist. Auto-creating..."),
      expect.any(String)
    );
  });

  it('should correctly process and parse incoming messages', async () => {
    const instance = { handle: jest.fn().mockResolvedValue(undefined) };
    const testPayload = { foo: 'bar' };
    const mockMessage = mockDeep<Message>();
    mockMessage.data = Buffer.from(JSON.stringify(testPayload)) as any;

    let messageHandler: (msg: Message) => Promise<void> = () => Promise.resolve();
    mockSubscription.on.mockImplementation((event: string, cb: any) => {
      if (event === 'message') messageHandler = cb;
      return mockSubscription;
    });

    jest.spyOn(discoveryService, 'getProviders').mockReturnValue([
      { instance, constructor: Object } as any,
    ]);
    jest.spyOn(reflector, 'get').mockReturnValue({
      topicName: 't',
      subscriptionName: 's',
    });

    await explorer.onModuleInit();

    await messageHandler(mockMessage);

    expect(instance.handle).toHaveBeenCalledWith(testPayload, mockMessage);
  });

  it('should nack the message if the handler throws an error', async () => {
    const instance = { handle: jest.fn().mockRejectedValue(new Error('Fail')) };
    const mockMessage = mockDeep<Message>();
    mockMessage.data = Buffer.from(JSON.stringify({})) as any;

    let messageHandler: (msg: Message) => Promise<void> = () => Promise.resolve();
    mockSubscription.on.mockImplementation((event: string, cb: any) => {
      if (event === 'message') messageHandler = cb;
      return mockSubscription;
    });

    jest.spyOn(discoveryService, 'getProviders').mockReturnValue([{ instance, constructor: Object } as any]);
    jest.spyOn(reflector, 'get').mockReturnValue({ topicName: 't', subscriptionName: 's' });

    await explorer.onModuleInit();
    await messageHandler(mockMessage);

    expect(mockMessage.nack).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should close all subscriptions on module destroy', () => {
    (explorer as any).subscriptions = [mockSubscription];

    explorer.onModuleDestroy();

    expect(mockSubscription.close).toHaveBeenCalled();
  });
});