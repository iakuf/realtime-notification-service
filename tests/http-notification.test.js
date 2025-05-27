import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createTestServer, createClient, waitForEvent, delay } from './helpers/test-utils.js'

describe('HTTP通知接口测试', () => {
  let server, io, app, serverPort
  let clients = []

  beforeAll(async () => {
    const testServer = createTestServer()
    server = testServer.server
    io = testServer.io
    app = testServer.app
    
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
    await delay(100)
  })

  // 辅助函数：发送HTTP请求
  const sendNotifyRequest = async (body) => {
    const response = await fetch(`http://localhost:${serverPort}/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    
    const responseBody = await response.text()
    let parsedBody = null
    try {
      parsedBody = JSON.parse(responseBody)
    } catch (e) {
      // 如果不是JSON，保持原样
      parsedBody = responseBody
    }
    
    return {
      status: response.status,
      body: parsedBody
    }
  }

  describe('向用户发送通知', () => {
    it('应该能够向指定用户发送通知', async () => {
      const appId = 'notify-app-1'
      const clientId = 'user123'
      
      // 创建客户端连接
      const client = createClient(serverPort, appId, { clientId })
      clients.push(client)
      await waitForEvent(client, 'connect')
      
      // 设置消息监听器
      const messagePromise = waitForEvent(client, 'dataUpdate')
      
      // 发送HTTP通知
      const response = await sendNotifyRequest({
        appId,
        users: [clientId],
        data: { message: 'Hello User', customField: 'test' }
      })
      
      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Notification sent successfully')
      
      // 验证客户端收到消息
      const [receivedData] = await messagePromise
      expect(receivedData.type).toBe('httpRequest')
      expect(receivedData.message).toBe('Hello User')
      expect(receivedData.customField).toBe('test')
    })

    it('应该能够向多个用户发送通知', async () => {
      const appId = 'notify-app-2'
      const users = ['user1', 'user2', 'user3']
      
      // 创建多个客户端连接
      const clientPromises = users.map(async (userId) => {
        const client = createClient(serverPort, appId, { clientId: userId })
        clients.push(client)
        await waitForEvent(client, 'connect')
        return client
      })
      
      const userClients = await Promise.all(clientPromises)
      
      // 设置消息监听器
      const messagePromises = userClients.map(client => 
        waitForEvent(client, 'dataUpdate')
      )
      
      // 发送HTTP通知
      const response = await sendNotifyRequest({
        appId,
        users,
        data: { broadcast: true, timestamp: Date.now() }
      })
      
      expect(response.status).toBe(200)
      
      // 验证所有客户端都收到消息
      const receivedMessages = await Promise.all(messagePromises)
      receivedMessages.forEach(([data]) => {
        expect(data.type).toBe('httpRequest')
        expect(data.broadcast).toBe(true)
        expect(data.timestamp).toBeDefined()
      })
    })

    it('应该在用户不在线时仍然返回成功', async () => {
      const appId = 'notify-app-3'
      
      // 发送通知给不存在的用户
      const response = await sendNotifyRequest({
        appId,
        users: ['non-existent-user'],
        data: { message: 'This will not be received' }
      })
      
      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Notification sent successfully')
    })
  })

  describe('向设备发送通知', () => {
    it('应该能够向指定设备发送通知', async () => {
      const appId = 'notify-app-4'
      const deviceId = 'device123'
      
      // 创建客户端连接
      const client = createClient(serverPort, appId, { deviceId })
      clients.push(client)
      await waitForEvent(client, 'connect')
      
      // 设置消息监听器
      const messagePromise = waitForEvent(client, 'dataUpdate')
      
      // 发送HTTP通知
      const response = await sendNotifyRequest({
        appId,
        devices: [deviceId],
        data: { deviceMessage: 'Hello Device' }
      })
      
      expect(response.status).toBe(200)
      
      // 验证设备收到消息
      const [receivedData] = await messagePromise
      expect(receivedData.type).toBe('httpRequest')
      expect(receivedData.deviceMessage).toBe('Hello Device')
    })

    it('应该能够向多个设备发送通知', async () => {
      const appId = 'notify-app-5'
      const devices = ['device1', 'device2']
      
      // 创建多个设备客户端
      const deviceClients = []
      for (const deviceId of devices) {
        const client = createClient(serverPort, appId, { deviceId })
        clients.push(client)
        await waitForEvent(client, 'connect')
        deviceClients.push(client)
      }
      
      // 设置消息监听器
      const messagePromises = deviceClients.map(client => 
        waitForEvent(client, 'dataUpdate')
      )
      
      // 发送HTTP通知
      const response = await sendNotifyRequest({
        appId,
        devices,
        data: { multiDevice: true }
      })
      
      expect(response.status).toBe(200)
      
      // 验证所有设备都收到消息
      const receivedMessages = await Promise.all(messagePromises)
      receivedMessages.forEach(([data]) => {
        expect(data.type).toBe('httpRequest')
        expect(data.multiDevice).toBe(true)
      })
    })
  })

  describe('向事件主题发送通知', () => {
    it('应该能够向订阅了事件主题的客户端发送通知', async () => {
      const appId = 'notify-app-6'
      const topic = 'payment:success'
      
      // 创建客户端并订阅事件
      const client = createClient(serverPort, appId)
      clients.push(client)
      await waitForEvent(client, 'connect')
      client.emit('subscribe', [topic])
      await delay(100)
      
      // 设置消息监听器
      const messagePromise = waitForEvent(client, 'dataUpdate')
      
      // 发送HTTP通知
      const response = await sendNotifyRequest({
        appId,
        eventTopics: [topic],
        data: { paymentId: '12345', amount: 100 }
      })
      
      expect(response.status).toBe(200)
      
      // 验证客户端收到消息
      const [receivedData] = await messagePromise
      expect(receivedData.type).toBe('httpRequest')
      expect(receivedData.topic).toBe(topic)
      expect(receivedData.paymentId).toBe('12345')
      expect(receivedData.amount).toBe(100)
    })

    it('应该能够向多个事件主题发送通知', async () => {
      const appId = 'notify-app-7'
      const topics = ['payment:success', 'order:created']
      
      // 创建两个客户端，分别订阅不同的事件
      const client1 = createClient(serverPort, appId)
      const client2 = createClient(serverPort, appId)
      clients.push(client1, client2)
      
      await Promise.all([
        waitForEvent(client1, 'connect'),
        waitForEvent(client2, 'connect')
      ])
      
      client1.emit('subscribe', [topics[0]])
      client2.emit('subscribe', [topics[1]])
      await delay(100)
      
      // 设置消息监听器
      const messagePromises = [
        waitForEvent(client1, 'dataUpdate'),
        waitForEvent(client2, 'dataUpdate')
      ]
      
      // 发送HTTP通知
      const response = await sendNotifyRequest({
        appId,
        eventTopics: topics,
        data: { multiTopicMessage: true }
      })
      
      expect(response.status).toBe(200)
      
      // 验证两个客户端都收到消息
      const [data1, data2] = await Promise.all(messagePromises)
      expect(data1[0].type).toBe('httpRequest')
      expect(data1[0].topic).toBe(topics[0])
      expect(data1[0].multiTopicMessage).toBe(true)
      
      expect(data2[0].type).toBe('httpRequest')
      expect(data2[0].topic).toBe(topics[1])
      expect(data2[0].multiTopicMessage).toBe(true)
    })

    it('应该能够向同一主题的多个订阅者发送通知', async () => {
      const appId = 'notify-app-8'
      const topic = 'broadcast:message'
      
      // 创建多个客户端订阅同一事件
      const clients_count = 3
      const topicClients = []
      
      for (let i = 0; i < clients_count; i++) {
        const client = createClient(serverPort, appId)
        clients.push(client)
        await waitForEvent(client, 'connect')
        client.emit('subscribe', [topic])
        topicClients.push(client)
      }
      
      await delay(100)
      
      // 设置消息监听器
      const messagePromises = topicClients.map(client => 
        waitForEvent(client, 'dataUpdate')
      )
      
      // 发送HTTP通知
      const response = await sendNotifyRequest({
        appId,
        eventTopics: [topic],
        data: { broadcastMessage: 'Hello All Subscribers' }
      })
      
      expect(response.status).toBe(200)
      
      // 验证所有订阅者都收到消息
      const receivedMessages = await Promise.all(messagePromises)
      receivedMessages.forEach(([data]) => {
        expect(data.type).toBe('httpRequest')
        expect(data.topic).toBe(topic)
        expect(data.broadcastMessage).toBe('Hello All Subscribers')
      })
    })
  })

  describe('混合通知测试', () => {
    it('应该能够同时向用户、设备和事件主题发送通知', async () => {
      const appId = 'notify-app-9'
      const userId = 'user123'
      const deviceId = 'device456'
      const topic = 'mixed:notification'
      
      // 创建用户客户端
      const userClient = createClient(serverPort, appId, { clientId: userId })
      clients.push(userClient)
      await waitForEvent(userClient, 'connect')
      
      // 创建设备客户端
      const deviceClient = createClient(serverPort, appId, { deviceId })
      clients.push(deviceClient)
      await waitForEvent(deviceClient, 'connect')
      
      // 创建主题订阅客户端
      const topicClient = createClient(serverPort, appId)
      clients.push(topicClient)
      await waitForEvent(topicClient, 'connect')
      topicClient.emit('subscribe', [topic])
      await delay(100)
      
      // 设置消息监听器
      const messagePromises = [
        waitForEvent(userClient, 'dataUpdate'),
        waitForEvent(deviceClient, 'dataUpdate'),
        waitForEvent(topicClient, 'dataUpdate')
      ]
      
      // 发送混合通知
      const response = await sendNotifyRequest({
        appId,
        users: [userId],
        devices: [deviceId],
        eventTopics: [topic],
        data: { mixedNotification: true, timestamp: Date.now() }
      })
      
      expect(response.status).toBe(200)
      
      // 验证所有客户端都收到消息
      const [userData, deviceData, topicData] = await Promise.all(messagePromises)
      
      // 验证用户客户端收到的消息
      expect(userData[0].type).toBe('httpRequest')
      expect(userData[0].mixedNotification).toBe(true)
      
      // 验证设备客户端收到的消息
      expect(deviceData[0].type).toBe('httpRequest')
      expect(deviceData[0].mixedNotification).toBe(true)
      
      // 验证主题客户端收到的消息
      expect(topicData[0].type).toBe('httpRequest')
      expect(topicData[0].topic).toBe(topic)
      expect(topicData[0].mixedNotification).toBe(true)
    })
  })

  describe('自定义事件名和数据测试', () => {
    it('应该支持自定义事件名', async () => {
      const appId = 'notify-app-10'
      const clientId = 'user123'
      const customEventName = 'customEvent'
      
      const client = createClient(serverPort, appId, { clientId })
      clients.push(client)
      await waitForEvent(client, 'connect')
      
      // 监听自定义事件
      const messagePromise = waitForEvent(client, customEventName)
      
      // 发送自定义事件通知
      const response = await sendNotifyRequest({
        appId,
        users: [clientId],
        eventName: customEventName,
        data: { customData: 'test' }
      })
      
      expect(response.status).toBe(200)
      
      // 验证收到自定义事件
      const [receivedData] = await messagePromise
      expect(receivedData.type).toBe('httpRequest')
      expect(receivedData.customData).toBe('test')
    })

    it('应该正确处理默认参数', async () => {
      const appId = 'notify-app-11'
      const clientId = 'user123'
      
      const client = createClient(serverPort, appId, { clientId })
      clients.push(client)
      await waitForEvent(client, 'connect')
      
      const messagePromise = waitForEvent(client, 'dataUpdate')
      
      // 发送最小化通知（只有必需参数）
      const response = await sendNotifyRequest({
        appId,
        users: [clientId]
      })
      
      expect(response.status).toBe(200)
      
      // 验证使用了默认值
      const [receivedData] = await messagePromise
      expect(receivedData.type).toBe('httpRequest')
    })
  })

  describe('错误处理测试', () => {
    it('应该处理缺少appId的请求', async () => {
      const response = await sendNotifyRequest({
        users: ['user123'],
        data: { test: true }
      })
      
      // 现在有了AJV验证，缺少必需参数appId应该返回400
      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid request parameters')
    })

    it('应该处理无效的JSON格式请求', async () => {
      // 创建一个会导致错误的请求 - 使用无效的JSON格式
      const response = await fetch(`http://localhost:${serverPort}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json string'
      })
      
      expect(response.status).toBe(400) // bodyParser会返回400而不是500
    })

    it('应该处理不提供目标的请求', async () => {
      // 只有appId但没有users, devices, eventTopics
      const response = await sendNotifyRequest({
        appId: 'test-app',
        data: { test: true }
      })
      
      expect(response.status).toBe(400)
      expect(response.body.error).toBe("At least one of 'users', 'devices', or 'eventTopics' must be provided")
    })

    it('应该处理超长的appId', async () => {
      const longAppId = 'a'.repeat(101) // 超过100字符限制
      
      const response = await sendNotifyRequest({
        appId: longAppId,
        users: ['user123'],
        data: { test: true }
      })
      
      expect(response.status).toBe(400)
      expect(response.body.error).toBe('Invalid request parameters')
    })
  })
}) 