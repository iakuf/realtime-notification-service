<template>
  <div class="chat-room">
    <div class="connection-status" :class="connectionState">
      <span class="status-indicator"></span>
      连接状态: {{ connectionStatusText }}
      <span v-if="error" class="error-text">({{ error.message }})</span>
    </div>
    
    <div class="online-count" v-if="onlineCount > 0">
      在线用户: {{ onlineCount }}
    </div>
    
    <div class="chat-messages" ref="messagesContainer">
      <div 
        v-for="message in messages" 
        :key="message.id"
        class="message"
        :class="{ 'own-message': message.from === currentUser }"
      >
        <div class="message-header">
          <span class="username">{{ message.from }}</span>
          <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
        </div>
        <div class="message-content">{{ message.content }}</div>
      </div>
    </div>
    
    <div class="chat-input">
      <input 
        v-model="newMessage"
        @keypress.enter="sendMessage"
        placeholder="输入消息..."
        :disabled="!connected"
      />
      <button @click="sendMessage" :disabled="!connected || !newMessage.trim()">
        发送
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useSocket } from '../composables/useSocket.js'

// Props
const props = defineProps({
  roomId: {
    type: String,
    required: true
  },
  currentUser: {
    type: String,
    required: true
  },
  deviceId: {
    type: String,
    default: () => `device-${Date.now()}`
  }
})

// Socket连接
const {
  connected,
  connectionState,
  error,
  onlineCounts,
  subscribe,
  subscribeCount,
  on
} = useSocket('http://localhost:3000', 'chat-app', {
  clientId: props.currentUser,
  deviceId: props.deviceId
})

// 数据
const messages = ref([])
const newMessage = ref('')
const messagesContainer = ref(null)

// 计算属性
const connectionStatusText = computed(() => {
  switch (connectionState.value) {
    case 'connecting': return '连接中...'
    case 'connected': return '已连接'
    case 'disconnected': return '已断开'
    case 'error': return '连接错误'
    default: return '未知状态'
  }
})

const onlineCount = computed(() => {
  return onlineCounts[`chat:${props.roomId}`] || 0
})

// 方法
const sendMessage = async () => {
  if (!newMessage.value.trim() || !connected.value) return
  
  try {
    // 发送HTTP请求到服务器
    const response = await fetch('http://localhost:3000/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appId: 'chat-app',
        eventTopics: [`chat:${props.roomId}`],
        data: {
          type: 'message',
          messageType: 'group',
          from: props.currentUser,
          content: newMessage.value,
          timestamp: Date.now()
        }
      })
    })
    
    if (response.ok) {
      newMessage.value = ''
    } else {
      console.error('Failed to send message')
    }
  } catch (error) {
    console.error('Error sending message:', error)
  }
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString()
}

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 监听器设置
watch(connected, (isConnected) => {
  if (isConnected) {
    // 连接成功后订阅聊天室和在线计数
    subscribe([`chat:${props.roomId}`])
    subscribeCount([`chat:${props.roomId}`])
  }
}, { immediate: true })

// 监听消息
on(`chat:${props.roomId}`, (payload) => {
  if (payload.type === 'message') {
    messages.value.push({
      id: Date.now() + Math.random(),
      ...payload
    })
    scrollToBottom()
  }
})

// 监听所有事件（用于调试）
on('*', (payload) => {
  console.log('Received event:', payload)
})

// 监听消息变化，自动滚动到底部
watch(messages, scrollToBottom, { flush: 'post' })
</script>

<style scoped>
.chat-room {
  max-width: 600px;
  margin: 0 auto;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.connection-status {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.connection-status.connected {
  background: #d4edda;
  color: #155724;
}

.connection-status.connecting {
  background: #fff3cd;
  color: #856404;
}

.connection-status.disconnected,
.connection-status.error {
  background: #f8d7da;
  color: #721c24;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.online-count {
  padding: 8px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  font-size: 14px;
  color: #6c757d;
}

.chat-messages {
  height: 400px;
  overflow-y: auto;
  padding: 16px;
  background: #f8f9fa;
}

.message {
  margin-bottom: 16px;
  padding: 12px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.message.own-message {
  background: #007bff;
  color: white;
  margin-left: 20%;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 12px;
  opacity: 0.8;
}

.username {
  font-weight: 500;
}

.message-content {
  font-size: 14px;
  line-height: 1.4;
}

.chat-input {
  display: flex;
  padding: 16px;
  background: white;
  border-top: 1px solid #dee2e6;
}

.chat-input input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-right: 8px;
}

.chat-input button {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.chat-input button:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.error-text {
  color: #dc3545;
  font-size: 12px;
}
</style> 