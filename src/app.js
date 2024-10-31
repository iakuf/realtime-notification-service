"use strict";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import http from "http";
import https from "https";
import Router from "koa-router";
import { instrument } from "@socket.io/admin-ui";

import { createLogger, format, transports } from "winston";

import { Server } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-streams-adapter";

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
  level: "debug",
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: "socket-server" },
  transports: [
    new transports.Console(),
    new transports.File({ filename: "combined.log" }),
  ],
});

const redisClient = new Redis();
redisClient.on("error", (err) => {
  console.error("Redis client error:", err);
});

const io = new Server({
  ...opts,
  adapter: createAdapter(redisClient),
});

instrument(io, {
  auth: false,
});
// 对默认命名空间进行认证
// io.use(socketAuthMiddleware());

// 注册名字空间处理器
io.of(/\/(.+)/).on("connection", (socket, request) => {
  const namespace = socket.nsp;
  const appId = namespace.name.replace(/^\//, ""); // 获取 appId
  logger.info(
    `${socket.id} 连接上名字空间 ${appId}`
  );

  // 获取客户端传递的 clientId 和 deviceId
  const clientId = socket.handshake.headers["x-client-id"];
  const deviceId = socket.handshake.headers["x-device-id"];

  // 加入基于 clientId 和 deviceId 的房间
  if (clientId) {
    socket.join(clientId);
    logger.info(`${socket.id} 名字空间 ${appId} 新增加一个 Client: ${clientId}`);
  }
  if (deviceId) {
    socket.join(deviceId);
    logger.info(`${socket.id} 名字空间 ${appId} 新增加一个 Device: ${deviceId}`);
  }

  socket.on("subscribe", (eventTopics) => {
    if (!Array.isArray(eventTopics)) {
      logger.warn(`${socket.id} 名字空间 ${appId} 错误的 subscribe 格式, ${eventTopics}`);
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
          logger.debug(`${socket.id} 名字空间 ${appId} 的订阅者增加，通知其它 ${topic} 订阅者更新订阅数量 ${topicRoom.size}`);
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
      logger.info(`${socket.io} 名字空间 ${appId} 订阅了 ${topic} 的在线数量`);
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
            `发送断开的信息给这个客户端所在的所有房间，这个房间 ${room} 有 ${topicRoom.szie} 个客户端.`
          );
          if (topicRoom && topicRoom.size > 1) {
            namespace.in(`${room}:count`).emit("dataUpdate", {
              type: "count",
              topic: room,
              count: topicRoom.size - 1,
            });
          }
        }
        logger.debug(`${socket.io} 用户离开了名字空间: ${appId} 和 room: ${room}`);
      }
    });
  });
});

// HTTP 接口用于触发实时更新
// 创建 Koa 路由器
function cors() {
  return async (ctx, next) => {
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
  };
}
const app = new Koa();
const router = new Router();
app.use(bodyParser());
app.use(cors());
app.use(router.routes()).use(router.allowedMethods());
const server = http.createServer(app.callback());
io.attach(server);
router.post("/notify", async (ctx) => {
  try {
    const { appId, users, devices, eventTopics, eventName, data } = ctx.request.body;

    // 默认事件名为 dataUpdate
    const effectiveEventName = eventName || "dataUpdate";

    // 默认数据对象为 httpRequest
    const effectiveData = data || { type: "httpRequest" };
    if (!effectiveData.type) {
        effectiveData.type = "httpRequest"
    }

    // 获取 Socket.IO 名字空间实例
    const namespace = io.of(`/${appId}`);

    // 向指定用户发送通知
    if (users && Array.isArray(users)) {
      users.forEach((user) => {
        namespace.in(user).emit(effectiveEventName, effectiveData);
      });
    }

    // 向指定设备发送通知
    if (devices && Array.isArray(devices)) {
      devices.forEach((device) => {
        namespace.in(device).emit(effectiveEventName, effectiveData);
      });
    }

    // 向指定 eventTopics 的房间发送通知
    if (eventTopics && Array.isArray(eventTopics)) {
      eventTopics.forEach((topic) => {
        // 默认的 eventTopics
        effectiveData.topic = topic || "";
        logger.info(`发送通知给 topice 名: ${topic}, 通知的范围是 appid: ${appId} 数据是 ${JSON.stringify(effectiveData)}`);
        namespace.in(topic).emit(effectiveEventName, effectiveData);
      });
    }

    ctx.status = 200;
    ctx.body = { message: "Notification sent successfully" };
  } catch (error) {
    logger.error(`error`, error);
    ctx.status = 500;
    ctx.body = { error: "Failed to send notification" };
  }
});

// 启动服务器const PORT = 3000;
// 使用路由
app.use(router.routes()).use(router.allowedMethods());

// 启动服务器
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
