"use strict";
import uWebKoa from "uwebkoa";
import { createLogger, format, transports } from "winston";
import { instrument } from "@socket.io/admin-ui";

import { Server } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-streams-adapter";

// 导入新的架构组件
import { NotificationService } from "./services/NotificationService.js";
import { NotificationController } from "./controllers/NotificationController.js";
import { setupNotificationRoutes } from "./routes/notificationRoutes.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export const opts = {
  pingInterval: 5000, // 每5秒发送一次ping消息
  pingTimeout: 15000, // 如果15秒内没有收到pong响应，则断开连接
  cors: {
    credentials: true,
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["x-device-id", "x-app-id", "x-client-id"],
  },
  allowEIO3: true,
  connectionStateRecovery: {
    maxDisconnectionDuration: 30 * 60, // 会话和数据包的备份持续时间
    skipMiddlewares: true, //成功恢复后是否跳过中间件
  },
  debug: true, // 启用调试模式
};

const logger = createLogger({
  level: process.env.NODE_ENV === 'test' ? "error" : "debug",
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: "socket-server" },
  transports: [
    new transports.Console(),
    new transports.File({ filename: "combined.log" }),
  ],
});

// 根据环境决定是否使用Redis
let redisClient = null;
let ioConfig = { ...opts };

// 只有在非测试环境中才使用Redis
if (process.env.NODE_ENV !== "test") {
  try {
    redisClient = new Redis();
    redisClient.on("error", (err) => {
      console.error("Redis client error:", err);
    });
    ioConfig.adapter = createAdapter(redisClient);
  } catch (error) {
    console.warn("Redis不可用，使用默认内存适配器:", error.message);
  }
}

const io = new Server(ioConfig);

instrument(io, {
  auth: false,
});

// 注册名字空间处理器
io.of(/\/(.+)/).on("connection", (socket, request) => {
  const namespace = socket.nsp;
  const appId = namespace.name.replace(/^\//, ""); // 获取 appId
  logger.info(`${socket.id} 连接上名字空间 ${appId}`);

  // 获取客户端传递的 clientId 和 deviceId
  const clientId = socket.handshake.headers["x-client-id"];
  const deviceId = socket.handshake.headers["x-device-id"];

  // 加入基于 clientId 和 deviceId 的房间
  if (clientId) {
    socket.join(clientId);
    logger.info(
      `${socket.id} 名字空间 ${appId} 新增加一个 Client: ${clientId}`
    );
  }
  if (deviceId) {
    socket.join(deviceId);
    logger.info(
      `${socket.id} 名字空间 ${appId} 新增加一个 Device: ${deviceId}`
    );
  }

  socket.on("subscribe", (eventTopics) => {
    if (!Array.isArray(eventTopics)) {
      logger.warn(
        `${socket.id} 名字空间 ${appId} 错误的 subscribe 格式, ${eventTopics}`
      );
      return;
    }
    eventTopics.forEach((topic) => {
      socket.join(topic);

      // 通过适配器来查指定的 topic 来获取房间内的用户数量
      var topicRoom = namespace.adapter.rooms.get(topic);
      if (topicRoom && topicRoom.size > 0) {
        // 发送房间内用户数量更新的通知给所有订阅了topic:count的客户端
        let topicCountKey = topic + ":count";
        var topicRoomCount = namespace.adapter.rooms.get(topicCountKey);
        if (topicRoomCount && topicRoomCount.size > 0) {
          logger.debug(
            `${socket.id} 名字空间 ${appId} 的订阅者增加，通知其它 ${topic} 订阅者更新订阅数量 ${topicRoom.size}`
          );
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
      logger.info(`${socket.id} 名字空间 ${appId} 订阅了 ${topic} 的在线数量`);
    });
  });

  socket.on("disconnecting", () => {
    // 当客户端还没完全断开连接时，遍历当前客户端所在的房间
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        // 忽略客户端自身的socket id
        // 确保目标房间名称中包含 ':' 且不包含 'count'
        if (room.includes(":") && !room.includes("count")) {
          var topicRoom = namespace.adapter.rooms.get(room);
          // 发送房间内用户数量更新的通知给所有订阅了room:count的客户端
          logger.debug(
            `发送断开的信息给这个客户端所在的所有房间，这个房间 ${room} 有 ${
              topicRoom?.size || 0
            } 个客户端.`
          );
          if (topicRoom && topicRoom.size > 1) {
            namespace.in(`${room}:count`).emit("dataUpdate", {
              type: "count",
              topic: room,
              count: topicRoom.size - 1,
            });
          }
        }
        logger.debug(
          `${socket.id} 用户离开了名字空间: ${appId} 和 room: ${room}`
        );
      }
    });
  });
});

// 创建 uWebKoa 实例
const app = new uWebKoa();

// 获取 uWebSocket.js 应用实例
const uWebSocketApp = app.getUWebSocketApp();

// 将 Socket.IO 附加到 uWebSocket.js 应用
io.attachApp(uWebSocketApp);

// 将 io 实例挂到 uWebKoa 上下文，方便其他地方使用
app.context.io = io;

// 创建服务层和控制器实例
const notificationService = new NotificationService(io, logger);
const notificationController = new NotificationController(notificationService, logger);

// 添加全局中间件
app.use(errorHandler(logger));

// 添加 CORS 中间件
app.use(async (ctx, next) => {
  ctx.set("Access-Control-Allow-Origin", "*");
  ctx.set(
    "Access-Control-Allow-Methods",
    "OPTIONS, GET, POST, PUT, PATCH, DELETE"
  );
  ctx.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (ctx.request.method === "OPTIONS") {
    ctx.status = 200;
    return;
  }
  await next();
});

// 添加请求日志中间件
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  
  logger.info(`${ctx.method} ${ctx.url} - ${ctx.status} - ${ms}ms`, {
    method: ctx.method,
    url: ctx.url,
    status: ctx.status,
    responseTime: ms,
    userAgent: ctx.request.headers['user-agent'] || 'unknown',
    ip: ctx.request.ip || ctx.request.headers['x-forwarded-for'] || 'unknown'
  });
});

// 设置路由
setupNotificationRoutes(app, notificationController);

// 启动服务器
const PORT = process.env.PORT || 3000;

let server = null;

// 只有在非测试环境下才自动启动服务器
if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });
} else {
  // 测试环境下，server就是app本身，提供测试需要的方法
  server = app;
}

// 导出测试需要的组件
export { server, io, app, logger, redisClient, notificationService, notificationController };
