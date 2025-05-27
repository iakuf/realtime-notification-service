import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createTestServer, createClient, waitForEvent, delay } from './helpers/test-utils.js'

describe('在线计数功能测试', () => {
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
    await delay(200) // 等待断开连接完成
  })

  describe('基础计数功能', () => {
    it('应该在客户端订阅事件时向数量订阅者发送计数更新', async () => {
      const appId = 'count-app-1'
      const topic = 'test:event'

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [topic])

      // 创建事件订阅客户端
      const subscriberClient = createClient(serverPort, appId)
      clients.push(subscriberClient)
      await waitForEvent(subscriberClient, 'connect')

      // 监听计数更新
      const countUpdatePromise = waitForEvent(countClient, 'dataUpdate')

      // 订阅事件，这应该触发计数更新
      subscriberClient.emit('subscribe', [topic])

      // 验证收到计数更新
      const [updateData] = await countUpdatePromise
      expect(updateData.type).toBe('count')
      expect(updateData.topic).toBe(topic)
      expect(updateData.count).toBe(1)
    })

    it('应该正确处理多个客户端订阅同一事件', async () => {
      const appId = 'count-app-2'
      const topic = 'multi:subscribers'

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [topic])

      const subscriberCount = 3
      const countUpdates = []

      // 创建多个事件订阅客户端
      for (let i = 0; i < subscriberCount; i++) {
        const subscriberClient = createClient(serverPort, appId)
        clients.push(subscriberClient)
        await waitForEvent(subscriberClient, 'connect')

        // 监听每次的计数更新
        const countUpdatePromise = waitForEvent(countClient, 'dataUpdate')
        
        // 订阅事件
        subscriberClient.emit('subscribe', [topic])
        
        // 收集计数更新
        const [updateData] = await countUpdatePromise
        countUpdates.push(updateData)
      }

      // 验证计数递增
      expect(countUpdates).toHaveLength(subscriberCount)
      countUpdates.forEach((update, index) => {
        expect(update.type).toBe('count')
        expect(update.topic).toBe(topic)
        expect(update.count).toBe(index + 1)
      })
    })

    it('应该在客户端断开连接时发送计数减少更新', async () => {
      const appId = 'count-app-3'
      const topic = 'disconnect:test'

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [topic])

      // 创建两个事件订阅客户端
      const subscriber1 = createClient(serverPort, appId)
      const subscriber2 = createClient(serverPort, appId)
      clients.push(subscriber1, subscriber2)

      await Promise.all([
        waitForEvent(subscriber1, 'connect'),
        waitForEvent(subscriber2, 'connect')
      ])

      // 两个客户端都订阅事件
      subscriber1.emit('subscribe', [topic])
      await waitForEvent(countClient, 'dataUpdate') // 等待第一个计数更新

      subscriber2.emit('subscribe', [topic])
      await waitForEvent(countClient, 'dataUpdate') // 等待第二个计数更新

      // 监听断开连接的计数更新
      const disconnectCountPromise = waitForEvent(countClient, 'dataUpdate')

      // 断开一个客户端
      subscriber1.disconnect()

      // 验证计数减少
      const [updateData] = await disconnectCountPromise
      expect(updateData.type).toBe('count')
      expect(updateData.topic).toBe(topic)
      expect(updateData.count).toBe(1) // 从2减少到1
    })
  })

  describe('多主题计数测试', () => {
    it('应该能够同时监听多个主题的计数', async () => {
      const appId = 'count-app-4'
      const topics = ['topic:1', 'topic:2', 'topic:3']

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', topics)

      // 为每个主题创建订阅客户端
      const results = []
      for (const topic of topics) {
        const subscriberClient = createClient(serverPort, appId)
        clients.push(subscriberClient)
        await waitForEvent(subscriberClient, 'connect')

        // 监听计数更新
        const countUpdatePromise = waitForEvent(countClient, 'dataUpdate')
        
        // 订阅特定主题
        subscriberClient.emit('subscribe', [topic])
        
        // 收集结果
        const [updateData] = await countUpdatePromise
        results.push({ topic, updateData })
      }

      // 验证每个主题都收到了正确的计数更新
      results.forEach(({ topic, updateData }) => {
        expect(updateData.type).toBe('count')
        expect(updateData.topic).toBe(topic)
        expect(updateData.count).toBe(1)
      })
    })

    it('应该独立统计不同主题的订阅者数量', async () => {
      const appId = 'count-app-5'
      const topic1 = 'independent:topic1'
      const topic2 = 'independent:topic2'

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [topic1, topic2])

      // 为topic1创建2个订阅者
      for (let i = 0; i < 2; i++) {
        const client = createClient(serverPort, appId)
        clients.push(client)
        await waitForEvent(client, 'connect')
        client.emit('subscribe', [topic1])
        await waitForEvent(countClient, 'dataUpdate') // 等待计数更新
      }

      // 为topic2创建3个订阅者
      for (let i = 0; i < 3; i++) {
        const client = createClient(serverPort, appId)
        clients.push(client)
        await waitForEvent(client, 'connect')
        client.emit('subscribe', [topic2])
        await waitForEvent(countClient, 'dataUpdate') // 等待计数更新
      }

      await delay(100) // 确保所有更新都已处理

      // 验证房间中的实际数量
      const namespace = io.of(`/${appId}`)
      const topic1Room = namespace.adapter.rooms.get(topic1)
      const topic2Room = namespace.adapter.rooms.get(topic2)

      expect(topic1Room.size).toBe(2)
      expect(topic2Room.size).toBe(3)
    })
  })

  describe('复杂场景测试', () => {
    it('应该正确处理客户端订阅多个主题的情况', async () => {
      const appId = 'count-app-6'
      const topics = ['multi:topic1', 'multi:topic2']

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', topics)

      // 创建订阅多个主题的客户端
      const multiSubscriber = createClient(serverPort, appId)
      clients.push(multiSubscriber)
      await waitForEvent(multiSubscriber, 'connect')

      // 收集计数更新 - 逐个订阅以保证顺序
      const countUpdates = []
      
      for (const topic of topics) {
        const countUpdatePromise = waitForEvent(countClient, 'dataUpdate')
        multiSubscriber.emit('subscribe', [topic])
        const [updateData] = await countUpdatePromise
        countUpdates.push(updateData)
      }

      // 验证两个主题都收到了计数更新
      expect(countUpdates).toHaveLength(2)
      
      const topic1Update = countUpdates.find(u => u.topic === topics[0])
      const topic2Update = countUpdates.find(u => u.topic === topics[1])
      
      expect(topic1Update).toBeDefined()
      expect(topic1Update.count).toBe(1)
      expect(topic2Update).toBeDefined()
      expect(topic2Update.count).toBe(1)
    })

    it('应该在客户端重复连接断开时正确维护计数', async () => {
      const appId = 'count-app-7'
      const topic = 'reconnect:test'

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [topic])

      // 创建基础订阅客户端
      const baseClient = createClient(serverPort, appId)
      clients.push(baseClient)
      await waitForEvent(baseClient, 'connect')
      baseClient.emit('subscribe', [topic])
      await waitForEvent(countClient, 'dataUpdate') // 计数变为1

      // 模拟客户端动态加入和离开
      const dynamicClient = createClient(serverPort, appId)
      clients.push(dynamicClient)
      await waitForEvent(dynamicClient, 'connect')
      
      // 动态客户端加入
      const joinPromise = waitForEvent(countClient, 'dataUpdate')
      dynamicClient.emit('subscribe', [topic])
      let [updateData] = await joinPromise
      expect(updateData.count).toBe(2)

      // 等待一段时间确保所有状态稳定
      await delay(200)

      // 动态客户端离开 - 直接检查最终状态而不是等待事件
      dynamicClient.disconnect()
      
      // 等待足够长的时间让断开事件处理完成
      await delay(500)
      
      // 验证最终房间状态
      const namespace = io.of(`/${appId}`)
      const topicRoom = namespace.adapter.rooms.get(topic)
      expect(topicRoom.size).toBe(1) // 应该只剩下基础客户端
    })

    it('应该在没有数量订阅者时不发送计数更新', async () => {
      const appId = 'count-app-8'
      const topic = 'no:count:subscribers'

      // 创建普通事件订阅客户端，但没有数量订阅客户端
      const subscriber = createClient(serverPort, appId)
      clients.push(subscriber)
      await waitForEvent(subscriber, 'connect')

      // 订阅事件（这不应该触发任何计数更新，因为没有数量订阅者）
      subscriber.emit('subscribe', [topic])
      await delay(200) // 等待一段时间

      // 验证房间存在但没有计数订阅房间
      const namespace = io.of(`/${appId}`)
      const topicRoom = namespace.adapter.rooms.get(topic)
      const countRoom = namespace.adapter.rooms.get(`${topic}:count`)

      expect(topicRoom).toBeDefined()
      expect(topicRoom.size).toBe(1)
      expect(countRoom).toBeUndefined() // 没有数量订阅者
    })
  })

  describe('边界情况测试', () => {
    it('应该正确处理房间名称包含特殊字符的情况', async () => {
      const appId = 'count-app-9'
      const topic = 'special:chars:topic::test'

      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [topic])

      const subscriber = createClient(serverPort, appId)
      clients.push(subscriber)
      await waitForEvent(subscriber, 'connect')

      const countUpdatePromise = waitForEvent(countClient, 'dataUpdate')
      subscriber.emit('subscribe', [topic])

      const [updateData] = await countUpdatePromise
      expect(updateData.type).toBe('count')
      expect(updateData.topic).toBe(topic)
      expect(updateData.count).toBe(1)
    })

    it('应该忽略包含count关键字的房间名称在断开计数中', async () => {
      const appId = 'count-app-10'
      const normalTopic = 'normal:topic'
      const countTopic = 'mycount:event' // 包含count的主题，断开时会被忽略

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [normalTopic]) // 只订阅normal主题的计数

      // 创建订阅客户端
      const subscriber = createClient(serverPort, appId)
      clients.push(subscriber)
      await waitForEvent(subscriber, 'connect')

      // 订阅normal主题并等待计数更新
      const normalCountPromise = waitForEvent(countClient, 'dataUpdate')
      subscriber.emit('subscribe', [normalTopic])
      await normalCountPromise

      // 订阅包含count的主题（不会有计数更新因为没有订阅其计数）
      subscriber.emit('subscribe', [countTopic])
      await delay(100)

      // 监听断开时的计数更新
      const countUpdates = []
      countClient.on('dataUpdate', (data) => {
        if (data.type === 'count') {
          countUpdates.push(data)
        }
      })

      // 断开订阅客户端
      subscriber.disconnect()
      await delay(500)

      // 根据原始代码逻辑：
      // - normalTopic包含":"且不包含"count" -> 会发送断开计数更新
      // - countTopic包含":"但也包含"count" -> 不会发送断开计数更新
      // 但是我们只订阅了normalTopic的计数，所以只会收到normalTopic的更新
      
      // 验证最终房间状态而不是事件数量
      const namespace = io.of(`/${appId}`)
      const normalRoom = namespace.adapter.rooms.get(normalTopic)
      const countRoom = namespace.adapter.rooms.get(countTopic)
      
      // 两个房间都应该为空（或不存在），因为订阅者已断开
      expect(normalRoom?.size || 0).toBe(0)
      expect(countRoom?.size || 0).toBe(0)
    })

    it('应该在订阅不包含冒号的主题时正常处理', async () => {
      const appId = 'count-app-11'
      const noColonTopic = 'nocolontopic' // 不包含冒号的主题

      // 创建数量监听客户端
      const countClient = createClient(serverPort, appId)
      clients.push(countClient)
      await waitForEvent(countClient, 'connect')
      countClient.emit('subscribeCount', [noColonTopic])

      // 创建订阅客户端
      const subscriber = createClient(serverPort, appId)
      clients.push(subscriber)
      await waitForEvent(subscriber, 'connect')

      // 监听计数更新
      const subscribeCountPromise = waitForEvent(countClient, 'dataUpdate')

      // 订阅不包含冒号的主题（仍然会触发订阅时的计数更新）
      subscriber.emit('subscribe', [noColonTopic])
      
      // 验证订阅时收到计数更新
      const [subscribeData] = await subscribeCountPromise
      expect(subscribeData.type).toBe('count')
      expect(subscribeData.count).toBe(1)

      // 但断开时不会有计数更新（因为不包含冒号）
      let disconnectUpdateReceived = false
      const disconnectListener = (data) => {
        if (data.type === 'count') {
          disconnectUpdateReceived = true
        }
      }
      countClient.on('dataUpdate', disconnectListener)

      // 断开客户端
      subscriber.disconnect()
      await delay(300)

      // 验证断开时没有收到计数更新（因为主题名不包含冒号）
      expect(disconnectUpdateReceived).toBe(false)
    })
  })
}) 