import { io as Client } from "socket.io-client";

// 设置测试环境变量
process.env.NODE_ENV = 'test';

// 导入真实的app.js实现
import { server, io, app, logger, redisClient } from '../../src/app.js';

// 创建测试服务器 - 直接使用app.js的真实实现
export const createTestServer = () => {
  // 返回app.js中的真实实例
  return { server, io, logger, app, redisClient };
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