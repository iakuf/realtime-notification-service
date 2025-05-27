import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createTestServer, createClient, waitForEvent, delay } from './helpers/test-utils.js'
import supertest from 'supertest'

describe('综合业务场景测试', () => {
  let server, io, serverPort, request
  let clients = []

  beforeAll(async () => {
    const testServer = createTestServer()
    server = testServer.server
    io = testServer.io
    
    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port
        request = supertest(`http://localhost:${serverPort}`)
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
    await delay(200)
  })

  describe('电商支付通知场景', () => {
    it('应该支持完整的支付流程通知', async () => {
      const appId = 'ecommerce-app'
      const orderId = 'order-12345'
      const userId = 'user-567'
      const deviceId = 'device-789'

      // 创建用户客户端（基于用户ID）
      const userClient = createClient(serverPort, appId, { clientId: userId })
      clients.push(userClient)
      await waitForEvent(userClient, 'connect')
      
      // 创建设备客户端（基于设备ID）
      const deviceClient = createClient(serverPort, appId, { deviceId })
      clients.push(deviceClient)
      await waitForEvent(deviceClient, 'connect')

      // 创建订单监听客户端
      const orderClient = createClient(serverPort, appId)
      clients.push(orderClient)
      await waitForEvent(orderClient, 'connect')
      orderClient.emit('subscribe', [`order:${orderId}:status`])

      // 创建支付统计监听客户端
      const paymentStatsClient = createClient(serverPort, appId)
      clients.push(paymentStatsClient)
      await waitForEvent(paymentStatsClient, 'connect')
      paymentStatsClient.emit('subscribeCount', ['payment:processing'])

      await delay(100)

      // 模拟支付开始处理通知
      const paymentStartPromises = [
        waitForEvent(userClient, 'dataUpdate'),
        waitForEvent(deviceClient, 'dataUpdate'),
        waitForEvent(orderClient, 'dataUpdate')
      ]

      await request
        .post('/notify')
        .send({
          appId,
          users: [userId],
          devices: [deviceId],
          eventTopics: [`order:${orderId}:status`],
          data: {
            type: 'payment',
            status: 'processing',
            orderId,
            amount: 99.99,
            timestamp: Date.now()
          }
        })

      // 验证所有相关客户端都收到支付开始通知
      const [userData, deviceData, orderData] = await Promise.all(paymentStartPromises)
      
      expect(userData[0].type).toBe('payment')
      expect(userData[0].status).toBe('processing')
      expect(userData[0].orderId).toBe(orderId)

      expect(deviceData[0].status).toBe('processing')
      expect(orderData[0].status).toBe('processing')

      // 模拟支付成功通知
      const paymentSuccessPromises = [
        waitForEvent(userClient, 'dataUpdate'),
        waitForEvent(deviceClient, 'dataUpdate'),
        waitForEvent(orderClient, 'dataUpdate')
      ]

      await request
        .post('/notify')
        .send({
          appId,
          users: [userId],
          devices: [deviceId],
          eventTopics: [`order:${orderId}:status`],
          data: {
            type: 'payment',
            status: 'success',
            orderId,
            transactionId: 'txn-abc123',
            amount: 99.99
          }
        })

      const [successUserData, successDeviceData, successOrderData] = await Promise.all(paymentSuccessPromises)
      
      expect(successUserData[0].status).toBe('success')
      expect(successUserData[0].transactionId).toBe('txn-abc123')
      expect(successDeviceData[0].status).toBe('success')
      expect(successOrderData[0].status).toBe('success')
    })
  })

  describe('实时聊天系统场景', () => {
    it('应该支持群聊和私聊的消息推送', async () => {
      const appId = 'chat-app'
      const roomId = 'room-general'
      const users = ['alice', 'bob', 'charlie']

      // 创建在线统计客户端（先创建，以便监听后续的订阅）
      const onlineStatsClient = createClient(serverPort, appId)
      clients.push(onlineStatsClient)
      await waitForEvent(onlineStatsClient, 'connect')
      onlineStatsClient.emit('subscribeCount', [`chat:${roomId}`])

      await delay(100)

      // 创建群聊参与者客户端并监听计数更新
      const chatClients = []
      for (let i = 0; i < users.length; i++) {
        const userId = users[i]
        const client = createClient(serverPort, appId, { clientId: userId })
        clients.push(client)
        await waitForEvent(client, 'connect')
        
        // 设置计数更新监听器（在订阅之前）
        const countUpdatePromise = waitForEvent(onlineStatsClient, 'dataUpdate')
        
        // 加入群聊房间
        client.emit('subscribe', [`chat:${roomId}`])
        chatClients.push({ userId, client })
        
        // 等待计数更新
        const [countData] = await countUpdatePromise
        expect(countData.type).toBe('count')
        expect(countData.count).toBe(i + 1) // 验证计数递增
      }

      await delay(100)

      // 模拟群聊消息发送
      const messagePromises = chatClients.map(({ client }) => 
        waitForEvent(client, 'dataUpdate')
      )

      await request
        .post('/notify')
        .send({
          appId,
          eventTopics: [`chat:${roomId}`],
          data: {
            type: 'message',
            messageType: 'group',
            from: 'alice',
            content: 'Hello everyone!',
            timestamp: Date.now()
          }
        })

      // 验证所有群聊成员都收到消息
      const messages = await Promise.all(messagePromises)
      messages.forEach(([messageData]) => {
        expect(messageData.type).toBe('message')
        expect(messageData.messageType).toBe('group')
        expect(messageData.from).toBe('alice')
        expect(messageData.content).toBe('Hello everyone!')
      })

      // 模拟私聊消息（Alice 发给 Bob）
      const privateMessagePromise = waitForEvent(
        chatClients.find(c => c.userId === 'bob').client, 
        'dataUpdate'
      )

      await request
        .post('/notify')
        .send({
          appId,
          users: ['bob'],
          data: {
            type: 'message',
            messageType: 'private',
            from: 'alice',
            to: 'bob',
            content: 'Hi Bob, how are you?'
          }
        })

      // 验证只有Bob收到私聊消息
      const [privateMessage] = await privateMessagePromise
      expect(privateMessage.messageType).toBe('private')
      expect(privateMessage.from).toBe('alice')
      expect(privateMessage.to).toBe('bob')
    })
  })

  describe('在线用户统计场景', () => {
    it('应该实时更新活动的在线用户统计', async () => {
      const appId = 'activity-app'
      const activityId = 'activity-live-stream'
      const maxUsers = 5

      // 创建统计监听客户端
      const statsClient = createClient(serverPort, appId)
      clients.push(statsClient)
      await waitForEvent(statsClient, 'connect')
      statsClient.emit('subscribeCount', [`activity:${activityId}`])

      // 模拟用户逐个加入活动
      const joinResults = []
      for (let i = 1; i <= maxUsers; i++) {
        const userClient = createClient(serverPort, appId, { clientId: `user${i}` })
        clients.push(userClient)
        await waitForEvent(userClient, 'connect')

        // 用户加入活动
        const countPromise = waitForEvent(statsClient, 'dataUpdate')
        userClient.emit('subscribe', [`activity:${activityId}`])
        
        const [countData] = await countPromise
        joinResults.push({
          userId: `user${i}`,
          count: countData.count
        })
      }

      // 验证用户数量递增
      joinResults.forEach((result, index) => {
        expect(result.count).toBe(index + 1)
      })

      // 模拟用户逐个离开活动
      const leaveResults = []
      for (let i = 0; i < Math.floor(maxUsers / 2); i++) {
        const countPromise = waitForEvent(statsClient, 'dataUpdate')
        clients[clients.length - 1 - i].disconnect() // 断开最后加入的用户
        
        const [countData] = await countPromise
        leaveResults.push({
          remainingCount: countData.count
        })
      }

      // 验证用户数量递减
      leaveResults.forEach((result, index) => {
        const expectedCount = maxUsers - (index + 1)
        expect(result.remainingCount).toBe(expectedCount)
      })
    })
  })

  describe('多应用隔离场景', () => {
    it('应该确保不同应用之间的消息隔离', async () => {
      const app1Id = 'app1'
      const app2Id = 'app2'
      const commonTopic = 'common:event'

      // 为两个不同应用创建客户端
      const app1Client = createClient(serverPort, app1Id, { clientId: 'user1' })
      const app2Client = createClient(serverPort, app2Id, { clientId: 'user1' }) // 相同用户ID但不同应用
      clients.push(app1Client, app2Client)

      await Promise.all([
        waitForEvent(app1Client, 'connect'),
        waitForEvent(app2Client, 'connect')
      ])

      // 两个应用的客户端都订阅相同的事件主题
      app1Client.emit('subscribe', [commonTopic])
      app2Client.emit('subscribe', [commonTopic])

      await delay(200) // 增加等待时间确保订阅完成

      // 向app1发送消息
      const app1MessagePromise = waitForEvent(app1Client, 'dataUpdate')
      
      // 设置app2的消息监听（应该不会收到消息）
      let app2ReceivedMessage = false
      app2Client.once('dataUpdate', () => {
        app2ReceivedMessage = true
      })

      // 发送HTTP请求并检查响应
      const response1 = await request
        .post('/notify')
        .send({
          appId: app1Id,
          eventTopics: [commonTopic],
          data: {
            message: 'This is for app1 only',
            appId: app1Id
          }
        })
        .expect(200) // 确保HTTP请求成功

      expect(response1.body.message).toBe('Notification sent successfully')

      // 验证只有app1客户端收到消息
      const [app1Message] = await app1MessagePromise
      expect(app1Message.message).toBe('This is for app1 only')
      expect(app1Message.appId).toBe(app1Id)

      // 等待一段时间确保app2没有收到消息
      await delay(300)
      expect(app2ReceivedMessage).toBe(false)

      // 向app2发送消息
      const app2MessagePromise = waitForEvent(app2Client, 'dataUpdate')

      const response2 = await request
        .post('/notify')
        .send({
          appId: app2Id,
          eventTopics: [commonTopic],
          data: {
            message: 'This is for app2 only',
            appId: app2Id
          }
        })
        .expect(200) // 确保HTTP请求成功

      expect(response2.body.message).toBe('Notification sent successfully')

      // 验证只有app2客户端收到消息
      const [app2Message] = await app2MessagePromise
      expect(app2Message.message).toBe('This is for app2 only')
      expect(app2Message.appId).toBe(app2Id)
    })
  })

  describe('实时推送性能场景', () => {
    it('应该能够处理大量并发客户端和消息推送', async () => {
      const appId = 'performance-app'
      const topic = 'broadcast:news'
      const clientCount = 20

      // 创建大量客户端
      const performanceClients = []
      for (let i = 0; i < clientCount; i++) {
        const client = createClient(serverPort, appId, { clientId: `user${i}` })
        clients.push(client)
        await waitForEvent(client, 'connect')
        client.emit('subscribe', [topic])
        performanceClients.push(client)
      }

      await delay(200) // 确保所有客户端都已订阅

      // 准备消息监听器
      const messagePromises = performanceClients.map(client => 
        waitForEvent(client, 'dataUpdate')
      )

      // 发送广播消息
      const startTime = Date.now()
      
      await request
        .post('/notify')
        .send({
          appId,
          eventTopics: [topic],
          data: {
            type: 'broadcast',
            title: 'Breaking News',
            content: 'Important update for all users',
            timestamp: startTime
          }
        })

      // 等待所有客户端收到消息
      const receivedMessages = await Promise.all(messagePromises)
      const endTime = Date.now()

      // 验证所有客户端都收到了消息
      expect(receivedMessages).toHaveLength(clientCount)
      receivedMessages.forEach(([messageData]) => {
        expect(messageData.type).toBe('broadcast')
        expect(messageData.title).toBe('Breaking News')
        expect(messageData.timestamp).toBe(startTime)
      })

      // 验证性能（所有消息应在合理时间内发送完成）
      const totalTime = endTime - startTime
      expect(totalTime).toBeLessThan(2000) // 应在2秒内完成
    })
  })

  describe('设备管理场景', () => {
    it('应该支持基于设备的通知推送和管理', async () => {
      const appId = 'device-app'
      const devices = ['mobile-ios-001', 'mobile-android-002', 'web-chrome-003']
      const userId = 'user123'

      // 为同一用户创建多个设备客户端
      const deviceClients = []
      for (const deviceId of devices) {
        const client = createClient(serverPort, appId, { 
          clientId: userId, 
          deviceId 
        })
        clients.push(client)
        await waitForEvent(client, 'connect')
        deviceClients.push({ deviceId, client })
      }

      // 测试向特定设备发送消息
      const iosDeviceClient = deviceClients.find(d => d.deviceId === 'mobile-ios-001').client
      const messagePromise = waitForEvent(iosDeviceClient, 'dataUpdate')

      await request
        .post('/notify')
        .send({
          appId,
          devices: ['mobile-ios-001'],
          data: {
            type: 'push',
            title: 'iOS specific notification',
            badge: 1
          }
        })

      const [deviceMessage] = await messagePromise
      expect(deviceMessage.type).toBe('push')
      expect(deviceMessage.title).toBe('iOS specific notification')
      expect(deviceMessage.badge).toBe(1)

      // 测试向用户的所有设备发送消息
      const allDevicePromises = deviceClients.map(({ client }) => 
        waitForEvent(client, 'dataUpdate')
      )

      await request
        .post('/notify')
        .send({
          appId,
          users: [userId],
          data: {
            type: 'sync',
            action: 'profile_updated',
            data: { name: 'John Doe', email: 'john@example.com' }
          }
        })

      const allMessages = await Promise.all(allDevicePromises)
      allMessages.forEach(([message]) => {
        expect(message.type).toBe('sync')
        expect(message.action).toBe('profile_updated')
        expect(message.data.name).toBe('John Doe')
      })
    })
  })
}) 