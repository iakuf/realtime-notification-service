import { Server } from "socket.io";
import { createServer } from "http";
import { io as Client } from "socket.io-client";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import Router from "koa-router";
import { createLogger, format, transports } from "winston";

// 创建测试专用的logger
export const createTestLogger = () => {
  return createLogger({
    level: "error", // 测试时只显示错误日志
    format: format.combine(format.timestamp(), format.json()),
    defaultMeta: { service: "test-socket-server" },
    transports: [
      new transports.Console({ silent: true }), // 静默模式
    ],
  });
};

// 创建测试服务器
export const createTestServer = (port = 0) => {
  const app = new Koa();
  const router = new Router();
  
  // CORS中间件
  app.use(async (ctx, next) => {
    ctx.set("Access-Control-Allow-Origin", "*");
    ctx.set("Access-Control-Allow-Methods", "OPTIONS, GET, POST, PUT, PATCH, DELETE");
    ctx.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-device-id, x-app-id, x-client-id");
    if (ctx.request.method === "OPTIONS") {
      ctx.status = 200;
      return;
    }
    await next();
  });

  app.use(bodyParser());
  app.use(router.routes()).use(router.allowedMethods());

  const server = createServer(app.callback());
  
  const opts = {
    pingInterval: 1000,
    pingTimeout: 3000,
    cors: {
      credentials: true,
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["x-device-id", "x-app-id", "x-client-id"],
    },
    allowEIO3: true,
  };

  const io = new Server(server, opts);
  const logger = createTestLogger();

  // 设置命名空间处理器
  io.of(/\/(.+)/).on("connection", (socket) => {
    const namespace = socket.nsp;
    const appId = namespace.name.replace(/^\//, "");

    const clientId = socket.handshake.headers["x-client-id"];
    const deviceId = socket.handshake.headers["x-device-id"];

    if (clientId) {
      socket.join(clientId);
    }
    if (deviceId) {
      socket.join(deviceId);
    }

    socket.on("subscribe", (eventTopics) => {
      if (!Array.isArray(eventTopics)) {
        return;
      }
      eventTopics.forEach((topic) => {
        socket.join(topic);

        const topicRoom = namespace.adapter.rooms.get(topic);
        if (topicRoom && topicRoom.size > 0) {
          const topicCountKey = topic + ":count";
          const topicRoomCount = namespace.adapter.rooms.get(topicCountKey);
          if (topicRoomCount && topicRoomCount.size > 0) {
            namespace.in(topicCountKey).emit("dataUpdate", {
              type: "count",
              topic: topic,
              count: topicRoom.size,
            });
          }
        }
      });
    });

    socket.on("subscribeCount", (eventTopics) => {
      eventTopics.forEach((topic) => {
        socket.join(`${topic}:count`);
      });
    });

    socket.on("disconnecting", () => {
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          if (room.includes(":") && !room.includes("count")) {
            const topicRoom = namespace.adapter.rooms.get(room);
            if (topicRoom && topicRoom.size > 1) {
              namespace.in(`${room}:count`).emit("dataUpdate", {
                type: "count",
                topic: room,
                count: topicRoom.size - 1,
              });
            }
          }
        }
      });
    });
  });

  // HTTP通知接口
  router.post("/notify", async (ctx) => {
    try {
      const { appId, users, devices, eventTopics, eventName, data } = ctx.request.body;

      const effectiveEventName = eventName || "dataUpdate";
      const effectiveData = data || { type: "httpRequest" };
      if (!effectiveData.type) {
        effectiveData.type = "httpRequest";
      }

      const namespace = io.of(`/${appId}`);

      if (users && Array.isArray(users)) {
        users.forEach((user) => {
          namespace.in(user).emit(effectiveEventName, effectiveData);
        });
      }

      if (devices && Array.isArray(devices)) {
        devices.forEach((device) => {
          namespace.in(device).emit(effectiveEventName, effectiveData);
        });
      }

      if (eventTopics && Array.isArray(eventTopics)) {
        eventTopics.forEach((topic) => {
          effectiveData.topic = topic || "";
          namespace.in(topic).emit(effectiveEventName, effectiveData);
        });
      }

      ctx.status = 200;
      ctx.body = { message: "Notification sent successfully" };
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: "Failed to send notification" };
    }
  });

  return { server, io, logger, app };
};

// 创建客户端连接
export const createClient = (serverPort, appId, options = {}) => {
  const { clientId, deviceId, ...socketOptions } = options;
  
  const headers = {};
  if (clientId) headers["x-client-id"] = clientId;
  if (deviceId) headers["x-device-id"] = deviceId;

  return Client(`http://localhost:${serverPort}/${appId}`, {
    extraHeaders: headers,
    forceNew: true,
    ...socketOptions,
  });
};

// 等待事件的辅助函数
export const waitForEvent = (emitter, event, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    emitter.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
};

// 等待多个事件
export const waitForEvents = (emitter, events, timeout = 5000) => {
  return Promise.all(events.map(event => waitForEvent(emitter, event, timeout)));
};

// 延迟函数
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms)); 