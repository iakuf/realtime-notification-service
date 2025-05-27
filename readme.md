# 实时通知服务系统

## 概述

实时通知服务系统是一个基于 Socket.IO 的强大实时通信解决方案，支持多应用隔离、精确消息推送、在线用户统计等功能。系统采用现代化架构设计，支持 Redis 集群扩展，为开发者提供完整的实时通信能力。

## ✨ 核心特性

### 🚀 高性能与可扩展性
- **多节点集群支持**：通过 Redis 适配器实现无限节点扩展
- **负载均衡**：支持多服务器实例，自动负载分配
- **数据同步**：集群节点间连接状态和房间成员实时同步

### 🎯 精准消息推送
- **多维度推送**：支持基于用户ID、设备ID、事件主题的精确推送
- **自定义事件**：允许注册和响应任意自定义通知事件
- **批量推送**：支持一次性向多个目标发送消息

### 📊 实时统计功能
- **在线计数**：实时统计各主题下的在线用户数量
- **状态监控**：提供连接状态、消息传递状态的实时监控
- **事件回调**：支持统计数据变化的即时通知

### 🔒 安全与隔离
- **应用隔离**：不同应用间完全隔离，数据互不干扰
- **命名空间管理**：基于应用ID的命名空间自动管理
- **参数验证**：使用 AJV 进行严格的参数验证

## 🛠️ 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
# 开发环境
npm run dev

# 生产环境
npm start
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并查看UI
npm run test:ui
```

## 📱 客户端集成

### JavaScript/TypeScript

```javascript
import { io } from 'socket.io-client'

// 连接到特定应用的命名空间
const socket = io('http://localhost:3000/your-app-id', {
  extraHeaders: {
    'x-client-id': 'user123',    // 用户标识
    'x-device-id': 'device456'   // 设备标识
  },
  reconnectionDelayMax: 10000
})

// 订阅事件主题
socket.emit('subscribe', ['payment:success', 'order:created'])

// 订阅在线计数
socket.emit('subscribeCount', ['chat:room1'])

// 监听数据更新
socket.on('dataUpdate', (payload) => {
  console.log('收到更新:', payload)
  
  switch (payload.type) {
    case 'httpRequest':
      // 处理HTTP触发的通知
      handleHttpNotification(payload)
      break
    case 'count':
      // 处理在线计数更新
      updateOnlineCount(payload.topic, payload.count)
      break
    case 'message':
      // 处理实时消息
      handleMessage(payload)
      break
  }
})
```

### Vue 3 组合式API

我们提供了完整的 Vue 3 集成方案：

```javascript
// composables/useSocket.js
import { useSocket } from './composables/useSocket.js'

export default {
  setup() {
    const {
      connected,
      connectionState,
      error,
      onlineCounts,
      subscribe,
      subscribeCount,
      on
    } = useSocket('http://localhost:3000', 'your-app-id', {
      clientId: 'user123',
      deviceId: 'device456'
    })

    // 订阅事件
    watch(connected, (isConnected) => {
      if (isConnected) {
        subscribe(['chat:room1'])
        subscribeCount(['chat:room1'])
      }
    })

    // 监听消息
    on('chat:room1', (payload) => {
      if (payload.type === 'message') {
        // 处理新消息
        messages.value.push(payload)
      }
    })

    return {
      connected,
      connectionState,
      onlineCounts
    }
  }
}
```

### uni-app 集成

```javascript
// services/socketService.js
import { io } from 'socket.io-client'

class SocketService {
  constructor(url, appId, clientId, deviceId) {
    this.socket = io(`${url}/${appId}`, {
      extraHeaders: {
        'x-client-id': clientId,
        'x-device-id': deviceId
      }
    })
    
    this.setupEventHandlers()
  }

  setupEventHandlers() {
    this.socket.on('dataUpdate', (payload) => {
      // 触发全局事件，供页面组件监听
      uni.$emit(`socket:${payload.topic}`, payload)
    })
  }

  subscribe(topics) {
    this.socket.emit('subscribe', topics)
  }

  subscribeCount(topics) {
    this.socket.emit('subscribeCount', topics)
  }
}

export default SocketService
```

## 🌐 HTTP API

### POST /notify

发送实时通知到指定目标。

**请求参数：**

```typescript
interface NotifyRequest {
  appId: string                    // 必需：应用ID
  users?: string[]                 // 可选：目标用户ID列表
  devices?: string[]               // 可选：目标设备ID列表
  eventTopics?: string[]           // 可选：事件主题列表
  eventName?: string               // 可选：事件名称，默认"dataUpdate"
  data?: object                    // 可选：消息数据，默认{type:"httpRequest"}
}
```

**请求示例：**

```bash
# 向特定用户和主题发送通知
curl -X POST http://localhost:3000/notify \
  -H 'Content-Type: application/json' \
  -d '{
    "appId": "ecommerce-app",
    "users": ["user123"],
    "devices": ["device456"],
    "eventTopics": ["payment:success"],
    "data": {
      "type": "payment",
      "orderId": "order-12345",
      "amount": 99.99,
      "status": "completed"
    }
  }'

# 广播消息到主题
curl -X POST http://localhost:3000/notify \
  -H 'Content-Type: application/json' \
  -d '{
    "appId": "chat-app",
    "eventTopics": ["chat:room1"],
    "data": {
      "type": "message",
      "from": "admin",
      "content": "欢迎加入聊天室！"
    }
  }'
```

**响应格式：**

```json
{
  "message": "Notification sent successfully"
}
```

**错误响应：**

```json
{
  "error": "Invalid request parameters",
  "details": [
    {
      "instancePath": "/appId",
      "schemaPath": "#/properties/appId/minLength",
      "keyword": "minLength",
      "params": {"limit": 1},
      "message": "must NOT have fewer than 1 characters"
    }
  ]
}
```

## 🏗️ 架构设计

### 系统架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App 1  │    │   Client App 2  │    │   Client App N  │
│  (Vue/React/    │    │  (uni-app/      │    │  (微信小程序/   │
│   小程序等)      │    │   React Native) │    │   其他平台)     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │ Socket.IO连接
                    ┌────────────▼────────────┐
                    │   Load Balancer        │
                    │  (Nginx/HAProxy)       │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼───────┐    ┌─────────▼───────┐    ┌─────────▼───────┐
│  Node.js App 1  │    │  Node.js App 2  │    │  Node.js App N  │
│  (本服务实例)    │    │  (本服务实例)    │    │  (本服务实例)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │ Redis Streams
                    ┌────────────▼────────────┐
                    │     Redis Cluster      │
                    │   (消息同步/状态存储)   │
                    └─────────────────────────┘
```

### 核心组件

1. **Socket.IO 服务器**：处理 WebSocket 连接和消息路由
2. **Redis 适配器**：实现多节点间的消息同步
3. **HTTP API**：提供外部系统的消息推送接口
4. **命名空间管理**：基于应用ID的隔离机制
5. **参数验证**：使用 AJV 确保数据安全性

## 📋 应用场景详解

### 🛒 电商支付通知场景

**业务需求：**
- 支付状态实时更新
- 多设备同步通知
- 订单状态追踪

**实现方案：**

```javascript
// 客户端订阅
socket.emit('subscribe', ['payment:processing', 'order:12345:status'])

// 服务端触发
fetch('/notify', {
  method: 'POST',
  body: JSON.stringify({
    appId: 'ecommerce-app',
    users: ['user123'],              // 通知用户
    devices: ['mobile-ios-001'],     // 通知设备
    eventTopics: ['order:12345:status'], // 通知订阅了此订单的客户端
    data: {
      type: 'payment',
      status: 'completed',
      orderId: 'order-12345',
      amount: 99.99,
      transactionId: 'txn-abc123'
    }
  })
})
```

### 💬 实时聊天系统

**功能特点：**
- 群聊和私聊支持
- 在线人数统计
- 消息实时推送
- 多设备同步

**实现示例：**

```javascript
// 加入聊天室
socket.emit('subscribe', ['chat:room-general'])
socket.emit('subscribeCount', ['chat:room-general']) // 订阅在线人数

// 发送消息
const sendMessage = async (content) => {
  await fetch('/notify', {
    method: 'POST',
    body: JSON.stringify({
      appId: 'chat-app',
      eventTopics: ['chat:room-general'],
      data: {
        type: 'message',
        messageType: 'group',
        from: 'alice',
        content: content,
        timestamp: Date.now()
      }
    })
  })
}

// 私聊消息
const sendPrivateMessage = async (toUser, content) => {
  await fetch('/notify', {
    method: 'POST',
    body: JSON.stringify({
      appId: 'chat-app',
      users: [toUser],  // 直接发送给特定用户
      data: {
        type: 'message',
        messageType: 'private',
        from: 'alice',
        to: toUser,
        content: content
      }
    })
  })
}
```

### 📊 实时数据统计

**应用场景：**
- 直播间在线人数
- 活动参与统计
- 实时监控面板

**实现方案：**

```javascript
// 订阅统计数据
socket.emit('subscribeCount', ['activity:live-stream-001'])

// 监听人数变化
socket.on('dataUpdate', (payload) => {
  if (payload.type === 'count') {
    console.log(`当前在线人数: ${payload.count}`)
    updateUI(payload.count)
  }
})

// 用户加入活动
const joinActivity = () => {
  socket.emit('subscribe', ['activity:live-stream-001'])
}
```

### 🔔 系统通知推送

**使用场景：**
- 系统维护通知
- 新功能发布
- 紧急公告

**实现示例：**

```javascript
// 全平台广播
const broadcastSystemNotice = async () => {
  await fetch('/notify', {
    method: 'POST',
    body: JSON.stringify({
      appId: 'system',
      eventTopics: ['system:broadcast'],
      data: {
        type: 'system',
        level: 'warning',
        title: '系统维护通知',
        content: '系统将于今晚23:00-01:00进行维护，请提前保存数据。',
        timestamp: Date.now()
      }
    })
  })
}
```

### 📱 多设备状态同步

**业务需求：**
- 用户在不同设备间的状态同步
- 数据一致性保障
- 设备间消息传递

**实现方案：**

```javascript
// 用户在手机端操作
const updateUserProfile = async (profileData) => {
  // 更新数据库
  await updateDatabase(profileData)
  
  // 同步到用户的所有设备
  await fetch('/notify', {
    method: 'POST',
    body: JSON.stringify({
      appId: 'user-center',
      users: ['user123'],  // 会发送到该用户的所有已连接设备
      data: {
        type: 'profile_sync',
        action: 'update',
        data: profileData
      }
    })
  })
}
```

## 🚀 性能优化

### 连接管理
- 自动重连机制
- 连接池管理
- 心跳检测

### 消息优化
- 消息批量处理
- 压缩传输
- 消息去重

### 扩展性
- 水平扩展支持
- 负载均衡
- Redis 集群

## 🧪 测试

系统提供完整的测试套件，覆盖以下场景：

- **基础连接测试**：客户端连接、断开、重连
- **消息推送测试**：HTTP 接口、事件订阅、消息传递
- **在线计数测试**：实时统计、多客户端场景
- **集成测试**：完整业务流程测试
- **性能测试**：大量并发连接测试

运行测试：

```bash
npm test                    # 运行所有测试
npm run test:ui            # 可视化测试界面
npm run test:watch         # 监视模式
```

## 📝 最佳实践

### 1. 连接管理
```javascript
// 推荐：使用连接状态管理
const { connected, connectionState, error } = useSocket(url, appId, options)

// 避免：频繁连接/断开
```

### 2. 事件订阅
```javascript
// 推荐：在连接成功后订阅
watch(connected, (isConnected) => {
  if (isConnected) {
    subscribe(['topic1', 'topic2'])
  }
})

// 避免：重复订阅相同主题
```

### 3. 错误处理
```javascript
// 推荐：完善的错误处理
socket.on('connect_error', (error) => {
  console.error('连接失败:', error)
  // 实现重试逻辑
})
```

### 4. 内存管理
```javascript
// 推荐：组件销毁时清理监听器
onUnmounted(() => {
  socket.disconnect()
})
```

## 🔧 配置选项

### 服务器配置

```javascript
export const opts = {
  pingInterval: 5000,          // 心跳间隔
  pingTimeout: 15000,          // 心跳超时
  cors: {
    credentials: true,
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["x-device-id", "x-app-id", "x-client-id"]
  },
  allowEIO3: true,             // 兼容性设置
  connectionStateRecovery: {
    maxDisconnectionDuration: 30 * 60,  // 断线恢复时间
    skipMiddlewares: true
  }
}
```

### Redis 配置

```javascript
const redisClient = new Redis({
  host: 'localhost',
  port: 6379,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
})
```

## 📚 API 参考

### Socket.IO 事件

| 事件名 | 描述 | 参数 |
|--------|------|------|
| `subscribe` | 订阅事件主题 | `string[]` |
| `subscribeCount` | 订阅在线计数 | `string[]` |
| `dataUpdate` | 数据更新通知 | `PayloadObject` |

### HTTP 接口

| 端点 | 方法 | 描述 |
|------|------|------|
| `/notify` | POST | 发送通知消息 |

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🆘 支持与反馈

- 📧 邮箱：iakuf@163.com
- 🐛 问题反馈：[GitHub Issues](https://github.com/your-repo/issues)
- 📖 文档：[项目文档](https://your-docs-site.com)

---

**快速体验**：克隆项目后运行 `npm install && npm start`，然后访问 `examples/` 目录查看完整示例！