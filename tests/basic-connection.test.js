import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createTestServer, createClient, waitForEvent, delay } from './helpers/test-utils.js'

describe('基础连接和订阅功能测试', () => {
  let server, io, serverPort
  let clients = []

  beforeAll(async () => {
    const testServer = createTestServer()
    server = testServer.server
    io = testServer.io
    
    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise((resolve) => {
      server.close(() => resolve())
    })
  })

  afterEach(async () => {
    // 清理所有客户端连接
    for (const client of clients) {
      if (client.connected) {
        client.disconnect()
      }
    }
    clients = []
    await delay(100) // 等待断开连接完成
  })

  describe('客户端连接测试', () => {
    it('应该能够成功连接到指定的命名空间', async () => {
      const appId = 'test-app-1'
      const client = createClient(serverPort, appId, {
        clientId: 'user123',
        deviceId: 'device456'
      })
      clients.push(client)

      await waitForEvent(client, 'connect')
      expect(client.connected).toBe(true)
    })

    it('应该能够正确处理clientId和deviceId', async () => {
      const appId = 'test-app-2'
      const clientId = 'user123'
      const deviceId = 'device456'
      
      const client = createClient(serverPort, appId, { clientId, deviceId })
      clients.push(client)

      await waitForEvent(client, 'connect')
      
      // 验证客户端已加入对应的房间
      const namespace = io.of(`/${appId}`)
      const clientRoom = namespace.adapter.rooms.get(clientId)
      const deviceRoom = namespace.adapter.rooms.get(deviceId)
      
      expect(clientRoom).toBeDefined()
      expect(deviceRoom).toBeDefined()
      expect(clientRoom.size).toBe(1)
      expect(deviceRoom.size).toBe(1)
    })

    it('应该支持多个客户端连接到同一命名空间', async () => {
      const appId = 'test-app-3'
      
      const client1 = createClient(serverPort, appId, { clientId: 'user1' })
      const client2 = createClient(serverPort, appId, { clientId: 'user2' })
      clients.push(client1, client2)

      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ])

      expect(client1.connected).toBe(true)
      expect(client2.connected).toBe(true)
      
      // 验证两个客户端都在各自的房间中
      const namespace = io.of(`/${appId}`)
      expect(namespace.adapter.rooms.get('user1').size).toBe(1)
      expect(namespace.adapter.rooms.get('user2').size).toBe(1)
    })
  })

  describe('事件订阅测试', () => {
    it('应该能够订阅单个事件', async () => {
      const appId = 'test-app-4'
      const client = createClient(serverPort, appId)
      clients.push(client)

      await waitForEvent(client, 'connect')
      
      const eventTopics = ['payment:success']
      client.emit('subscribe', eventTopics)
      
      await delay(100) // 等待订阅完成
      
      // 验证客户端已加入对应的房间
      const namespace = io.of(`/${appId}`)
      const topicRoom = namespace.adapter.rooms.get('payment:success')
      expect(topicRoom).toBeDefined()
      expect(topicRoom.size).toBe(1)
    })

    it('应该能够订阅多个事件', async () => {
      const appId = 'test-app-5'
      const client = createClient(serverPort, appId)
      clients.push(client)

      await waitForEvent(client, 'connect')
      
      const eventTopics = ['payment:success', 'order:created', 'user:login']
      client.emit('subscribe', eventTopics)
      
      await delay(100)
      
      // 验证客户端已加入所有对应的房间
      const namespace = io.of(`/${appId}`)
      eventTopics.forEach(topic => {
        const topicRoom = namespace.adapter.rooms.get(topic)
        expect(topicRoom).toBeDefined()
        expect(topicRoom.size).toBe(1)
      })
    })

    it('应该拒绝非数组格式的订阅请求', async () => {
      const appId = 'test-app-6'
      const client = createClient(serverPort, appId)
      clients.push(client)

      await waitForEvent(client, 'connect')
      
      // 发送非数组格式的订阅请求
      client.emit('subscribe', 'invalid-format')
      
      await delay(100)
      
      // 验证没有创建对应的房间
      const namespace = io.of(`/${appId}`)
      const invalidRoom = namespace.adapter.rooms.get('invalid-format')
      expect(invalidRoom).toBeUndefined()
    })
  })

  describe('数量统计订阅测试', () => {
    it('应该能够订阅事件数量统计', async () => {
      const appId = 'test-app-7'
      const client = createClient(serverPort, appId)
      clients.push(client)

      await waitForEvent(client, 'connect')
      
      const eventTopics = ['payment:success']
      client.emit('subscribeCount', eventTopics)
      
      await delay(100)
      
      // 验证客户端已加入数量统计房间
      const namespace = io.of(`/${appId}`)
      const countRoom = namespace.adapter.rooms.get('payment:success:count')
      expect(countRoom).toBeDefined()
      expect(countRoom.size).toBe(1)
    })

    it('应该在有新订阅者时发送数量更新', async () => {
      const appId = 'test-app-8'
      const topic = 'payment:success'
      
      // 第一个客户端订阅数量统计
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [topic])
      
      // 设置数量更新监听器
      const countUpdatePromise = waitForEvent(countClient, 'dataUpdate')
      
      // 第二个客户端订阅实际事件
      const subscriberClient = createClient(serverPort, appId)
      clients.push(subscriberClient)
      await waitForEvent(subscriberClient, 'connect')
      subscriberClient.emit('subscribe', [topic])
      
      // 验证收到数量更新
      const [updateData] = await countUpdatePromise
      expect(updateData.type).toBe('count')
      expect(updateData.topic).toBe(topic)
      expect(updateData.count).toBe(1)
    })
  })

  describe('客户端断开连接测试', () => {
    it('应该在客户端断开时更新房间数量', async () => {
      const appId = 'test-app-9'
      const topic = 'payment:success'
      
      // 数量统计客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [topic])
      
      // 两个订阅客户端
      const client1 = createClient(serverPort, appId)
      const client2 = createClient(serverPort, appId)
      clients.push(client1, client2)
      
      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ])
      
      client1.emit('subscribe', [topic])
      client2.emit('subscribe', [topic])
      
      await delay(200) // 等待订阅完成
      
      // 监听数量更新
      const countUpdatePromise = waitForEvent(countClient, 'dataUpdate')
      
      // 断开一个客户端
      client1.disconnect()
      
      // 验证收到数量更新
      const [updateData] = await countUpdatePromise
      expect(updateData.type).toBe('count')
      expect(updateData.topic).toBe(topic)
      expect(updateData.count).toBe(1) // 从2减少到1
    })
  })
}) 