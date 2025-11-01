import { Test } from "@nestjs/testing";
import { PubsubPublisher } from "./pubsub-publisher.service";
import { PubSub, Topic } from "@google-cloud/pubsub";
import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { LoggerService } from "@nestjs/common";
import {
  PUBSUB_CLIENT,
  PUBSUB_LOGGER,
  PUBSUB_MERGED_OPTIONS,
} from "./constants";
import { PubsubEmulatorOptions } from "./pubsub.types";
import { mockReject, mockResolve } from "./test.utils";

describe("PubsubPublisher", () => {
  let publisher: PubsubPublisher;
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
        PubsubPublisher,
        { provide: PUBSUB_CLIENT, useValue: mockPubSubClient },
        { provide: PUBSUB_LOGGER, useValue: mockLogger },
        { provide: PUBSUB_MERGED_OPTIONS, useValue: mockOptions },
      ],
    }).compile();

    publisher = moduleRef.get(PubsubPublisher);
  });

  it("should dispatch an event and log success", async () => {
    const topicName = "test-topic";
    const data = { key: "value" };
    const messageId = "message-123";
    const mockTopic = mockDeep<Topic>();
    mockPubSubClient.topic.calledWith(topicName).mockReturnValue(mockTopic);
    mockResolve(mockTopic.publishMessage, messageId);
    mockResolve(mockTopic.exists, [true]);
    await publisher.dispatchEvent(topicName, data);
    expect(mockTopic.publishMessage).toHaveBeenCalledWith({
      data: Buffer.from(JSON.stringify(data)),
      attributes: {},
    });
    expect(mockLogger.log).toHaveBeenCalledWith(
      "Event dispatched successfully",
      expect.anything(),
      expect.objectContaining({ messageId })
    );
  });

  it("should throw and log an error if publishing fails", async () => {
    const error = new Error("Publishing failed");
    const mockTopic = mockDeep<Topic>();
    mockPubSubClient.topic.mockReturnValue(mockTopic);
    mockResolve(mockTopic.exists, [true]);
    mockReject(mockTopic.publishMessage, error);
    await expect(publisher.dispatchEvent("any-topic", {})).rejects.toThrow(
      error
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to dispatch event",
      error.stack,
      expect.anything(),
      expect.anything()
    );
  });

  it("should auto-create a topic if it does not exist and autoCreate is enabled", async () => {
    mockOptions.autoCreateTopics = true;
    const mockTopic = mockDeep<Topic>();
    mockPubSubClient.topic.mockReturnValue(mockTopic);
    mockResolve(mockTopic.exists, [false]);
    await publisher.dispatchEvent("new-topic", {});
    expect(mockTopic.create).toHaveBeenCalled();
  });

  it("should THROW if topic does not exist and autoCreate is disabled", async () => {
    mockOptions.autoCreateTopics = false;
    const mockTopic = mockDeep<Topic>();
    mockPubSubClient.topic.mockReturnValue(mockTopic);
    mockResolve(mockTopic.exists, [false]);
    await expect(publisher.dispatchEvent("new-topic", {})).rejects.toThrow(
      "Topic 'new-topic' does not exist and auto-creation is disabled."
    );
    expect(mockTopic.create).not.toHaveBeenCalled();
  });
});
