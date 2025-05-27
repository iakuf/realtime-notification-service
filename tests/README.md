# 测试文档

## 测试概述

本项目包含了完整的测试套件，使用 Vitest 作为测试框架，全面覆盖了实时通知服务的各种功能和使用场景。

## 测试结构

### 1. 测试辅助工具 (`helpers/test-utils.js`)
- `createTestServer()`: 创建测试专用的服务器实例
- `createClient()`: 创建Socket.IO客户端连接
- `waitForEvent()`: 等待特定事件的辅助函数
- `delay()`: 延迟函数

### 2. 基础连接测试 (`basic-connection.test.js`)
测试核心连接和订阅功能：
- 客户端连接到指定命名空间
- clientId 和 deviceId 的正确处理
- 多客户端连接支持
- 事件订阅功能
- 数量统计订阅
- 客户端断开连接处理

### 3. HTTP通知接口测试 (`http-notification.test.js`)
测试HTTP API的通知推送功能：
- 向指定用户发送通知
- 向指定设备发送通知
- 向事件主题发送通知
- 混合通知（用户+设备+主题）
- 自定义事件名和数据
- 错误处理

### 4. 在线计数功能测试 (`online-count.test.js`)
专门测试在线用户统计功能：
- 基础计数功能
- 多主题计数
- 复杂场景（多客户端动态加入离开）
- 边界情况处理

### 5. 综合业务场景测试 (`integration.test.js`)
模拟真实业务场景的集成测试：
- 电商支付通知流程
- 实时聊天系统
- 在线用户统计
- 多应用隔离
- 性能测试
- 设备管理

## 测试覆盖的功能

### 核心功能
- ✅ Socket.IO 命名空间连接
- ✅ 客户端身份识别（clientId, deviceId）
- ✅ 事件订阅和取消订阅
- ✅ 房间管理
- ✅ HTTP 通知接口

### 高级功能
- ✅ 在线计数统计
- ✅ 多主题订阅
- ✅ 实时数量更新
- ✅ 断开连接处理
- ✅ 多应用隔离

### 业务场景
- ✅ 支付流程通知
- ✅ 聊天系统消息推送
- ✅ 用户上线下线统计
- ✅ 设备管理和推送
- ✅ 广播消息
- ✅ 私聊消息

## 如何运行测试

### 安装依赖
```bash
npm install
# 或
pnpm install
```

### 运行所有测试
```bash
npm run test
```

### 运行特定测试文件
```bash
# 基础连接测试
npm run test basic-connection.test.js

# HTTP通知测试
npm run test http-notification.test.js

# 在线计数测试
npm run test online-count.test.js

# 综合场景测试
npm run test integration.test.js
```

### 监控模式（开发时使用）
```bash
npm run test:watch
```

### 生成测试覆盖率报告
```bash
npm run test:run -- --coverage
```

### 启动测试UI界面
```bash
npm run test:ui
```

## 测试配置

测试配置位于 `vitest.config.js` 文件中：

```javascript
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
  },
})
```

## 测试数据和清理

每个测试用例都会：
1. 在测试开始前创建独立的服务器实例
2. 在每个测试后清理所有客户端连接
3. 在测试结束后关闭服务器

这确保了测试之间的隔离性和可重复性。

## 调试测试

如果测试失败，可以：

1. 查看控制台输出的错误信息
2. 增加延迟时间以排除时序问题
3. 使用 `console.log` 添加调试信息
4. 运行单个测试文件进行调试

## 扩展测试

要添加新的测试用例：

1. 在相应的测试文件中添加新的 `describe` 或 `it` 块
2. 使用测试辅助工具创建客户端和服务器
3. 遵循现有的测试模式和命名约定
4. 确保清理资源

## 性能考虑

测试中包含了性能验证：
- 大量并发客户端的处理能力
- 消息推送的响应时间
- 内存泄漏检查（通过客户端清理）

这些测试帮助确保系统在生产环境中的可靠性。 