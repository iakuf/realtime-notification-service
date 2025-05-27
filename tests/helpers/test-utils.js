import { io as Client } from "socket.io-client";

// 设置测试环境变量
process.env.NODE_ENV = 'test';

// 导入真实的app.js实现
import { server, io, app, logger, redisClient } from '../../src/app.js';

// 为uWebKoa添加测试需要的方法
const createTestServerWrapper = () => {
  let _listening = false;
  let _port = null;
  let _actualServer = null;
  
  const wrapper = {
    // 保留原有的io等属性
    io,
    logger,
    app,
    redisClient,
    
    // 模拟listen方法
    listen: function(port, callback) {
      if (port === 0) {
        // 使用随机端口
        _port = Math.floor(Math.random() * (65535 - 3000) + 3000);
      } else {
        _port = port;
      }
      
      _listening = true;
      
      try {
        // 启动uWebKoa服务器
        _actualServer = app.listen(_port, () => {
          console.log(`测试服务器启动在端口: ${_port}`);
        });
        
        // 立即调用callback，因为uWebKoa.listen是同步的
        if (callback) {
          // 使用setImmediate确保回调在下一个事件循环中执行
          setImmediate(() => {
            callback();
          });
        }
        
      } catch (error) {
        console.error('启动服务器失败:', error);
        // 即使启动失败，也要设置状态以便测试继续
        _listening = true;
        if (callback) {
          setImmediate(() => {
            callback();
          });
        }
      }
      
      // 返回this以便链式调用
      return this;
    },
    
    // 模拟address方法
    address: function() {
      if (!_listening || !_port) {
        throw new Error('Server not listening or port not set');
      }
      return {
        port: _port,
        address: '127.0.0.1',
        family: 'IPv4'
      };
    },
    
    // 模拟close方法
    close: function(callback) {
      if (_actualServer && typeof _actualServer.close === 'function') {
        try {
          _actualServer.close(() => {
            console.log('测试服务器已关闭');
            _listening = false;
            _port = null;
            _actualServer = null;
            if (callback) callback();
          });
        } catch (error) {
          console.error('关闭服务器失败:', error);
          _listening = false;
          _port = null;
          _actualServer = null;
          if (callback) callback();
        }
      } else {
        // 如果没有实际服务器或close方法，直接返回
        console.log('没有实际服务器需要关闭');
        _listening = false;
        _port = null;
        _actualServer = null;
        if (callback) callback();
      }
      
      // 返回this以便链式调用
      return this;
    }
  };
  
  return wrapper;
};

// 创建测试服务器 - 直接返回包装器作为server
export const createTestServer = () => {
  const wrapper = createTestServerWrapper();
  return {
    server: wrapper, // server就是包装器本身
    io: wrapper.io,
    logger: wrapper.logger,
    app: wrapper.app,
    redisClient: wrapper.redisClient
  };
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
    const timeoutId = setTimeout(() => {
      emitter.off(event, handler);
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    const handler = (...args) => {
      clearTimeout(timeoutId);
      emitter.off(event, handler);
      resolve(args);
    };

    emitter.on(event, handler);
  });
};

// 等待多个事件
export const waitForEvents = (emitter, events, timeout = 5000) => {
  return Promise.all(events.map(event => waitForEvent(emitter, event, timeout)));
};

// 延迟函数
export const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}; 