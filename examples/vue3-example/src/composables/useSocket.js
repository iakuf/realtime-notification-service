import { ref, onMounted, onUnmounted, reactive } from 'vue'
import { io } from 'socket.io-client'

/**
 * Vue3 Socket.IO 组合式API
 * @param {string} url - Socket.IO服务器地址
 * @param {string} appId - 应用ID
 * @param {Object} options - 连接选项
 * @returns {Object} Socket相关的响应式数据和方法
 */
export function useSocket(url, appId, options = {}) {
  const socket = ref(null)
  const connected = ref(false)
  const error = ref(null)
  const events = reactive({})
  
  // 连接状态
  const connectionState = ref('disconnected') // disconnected, connecting, connected, error
  
  // 在线计数数据
  const onlineCounts = reactive({})
  
  // 初始化Socket连接
  const connect = () => {
    try {
      connectionState.value = 'connecting'
      
      const { clientId, deviceId, ...socketOptions } = options
      
      const headers = {}
      if (clientId) headers['x-client-id'] = clientId
      if (deviceId) headers['x-device-id'] = deviceId
      
      socket.value = io(`${url}/${appId}`, {
        extraHeaders: headers,
        reconnectionDelayMax: 10000,
        autoConnect: true,
        ...socketOptions
      })
      
      // 连接事件
      socket.value.on('connect', () => {
        connected.value = true
        connectionState.value = 'connected'
        error.value = null
        console.log(`Connected to ${appId} namespace`)
      })
      
      socket.value.on('disconnect', (reason) => {
        connected.value = false
        connectionState.value = 'disconnected'
        console.log(`Disconnected from ${appId} namespace:`, reason)
      })
      
      socket.value.on('connect_error', (err) => {
        error.value = err
        connectionState.value = 'error'
        console.error('Connection error:', err)
      })
      
      // 数据更新事件
      socket.value.on('dataUpdate', (payload) => {
        handleDataUpdate(payload)
      })
      
    } catch (err) {
      error.value = err
      connectionState.value = 'error'
    }
  }
  
  // 处理数据更新
  const handleDataUpdate = (payload) => {
    const { type, topic } = payload
    
    if (type === 'count') {
      // 更新在线计数
      onlineCounts[topic] = payload.count
    }
    
    // 触发相应的事件回调
    if (events[topic]) {
      events[topic].forEach(callback => callback(payload))
    }
    
    // 触发全局事件
    if (events['*']) {
      events['*'].forEach(callback => callback(payload))
    }
  }
  
  // 订阅事件主题
  const subscribe = (eventTopics) => {
    if (!socket.value || !connected.value) {
      console.warn('Socket not connected, queuing subscription...')
      // 可以在这里实现连接后自动订阅的队列
      return
    }
    
    const topics = Array.isArray(eventTopics) ? eventTopics : [eventTopics]
    socket.value.emit('subscribe', topics)
    console.log('Subscribed to topics:', topics)
  }
  
  // 订阅在线计数
  const subscribeCount = (eventTopics) => {
    if (!socket.value || !connected.value) {
      console.warn('Socket not connected, queuing count subscription...')
      return
    }
    
    const topics = Array.isArray(eventTopics) ? eventTopics : [eventTopics]
    socket.value.emit('subscribeCount', topics)
    console.log('Subscribed to count updates for topics:', topics)
  }
  
  // 监听特定主题的事件
  const on = (topic, callback) => {
    if (!events[topic]) {
      events[topic] = []
    }
    events[topic].push(callback)
    
    // 返回取消监听的函数
    return () => off(topic, callback)
  }
  
  // 取消监听
  const off = (topic, callback) => {
    if (events[topic]) {
      const index = events[topic].indexOf(callback)
      if (index > -1) {
        events[topic].splice(index, 1)
      }
    }
  }
  
  // 断开连接
  const disconnect = () => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
      connected.value = false
      connectionState.value = 'disconnected'
    }
  }
  
  // 组件挂载时连接
  onMounted(() => {
    connect()
  })
  
  // 组件卸载时断开连接
  onUnmounted(() => {
    disconnect()
  })
  
  return {
    // 状态
    socket: socket.value,
    connected,
    connectionState,
    error,
    onlineCounts,
    
    // 方法
    connect,
    disconnect,
    subscribe,
    subscribeCount,
    on,
    off
  }
} 