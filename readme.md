
# 实时在线同步系统使用介绍

# 简介

实时在线同步系统是一个强大的工具，允许开发者构建实时交互式应用程序。本系统支持多节点扩展、精确的消息推送以及订阅者统计等功能。本文档将详细介绍如何在客户端集成此系统，并利用其实现即时通讯、在线计数等功能。

# 特性

### 多节点可扩展性

- 无限节点扩展：通过Redis作为共享存储，可以轻松地在多个服务器之间扩展服务，实现负载均衡和高可用性。
- 数据同步：所有节点之间的连接状态和房间成员都会实时同步，确保数据的一致性。

### 精确的消息推送

- 基于设备ID（deviceId）和用户ID (clientId) 的消息推送：可以根据特定的设备ID或用户ID向指定客户端发送消息。
- 自定义通知事件：允许客户端注册任何自定义的通知事件，并对这些事件做出响应。

### 订阅者统计

- 在线计数服务：系统能够记录每个主题下的在线用户数量，并允许客户端订阅这些统计数据的变化。

# 客户端集成指南

### 客户端连接

在客户端部分，您可以使用以下 JavaScript 代码来连接到 WebSocket 服务并接收数据更新：

```JavaScript
import io from 'socket.io-client';

// 每个应用自己的 appid
// clientId: 可以是用户的 userid, openid 等，用于单独发向指定用户的时候使用。
// deviceId: 用户的设备标识，用于发给指定的设备。
const appid = 'your-app-id-here';
const socket = io(`http://localhost:3000/${appid}`, {
  extraHeaders: {
     'X-App-Id': appId,
     'X-Client-Id': clientId,
     'X-Device-Id': deviceId
  },
  reconnectionDelayMax: 10000,
  auth: {
    token: "123"
  },
  query: "debug=1" // 启用调试模式
});
```

### 订阅特定事件

接下来，您可以使用以下函数来订阅特定的事件，并处理从服务器接收到的数据更新：

```JavaScript
// 订阅特定活动
function subscribeToEvent(eventIdentifier, eventType) {
  const eventTopics= [`${eventIdentifier}:${eventType}`, ];
  socket.emit('subscribe', eventTopics);
  socket.on('dataUpdate', (payload) => {
    console.log('Received update:', payload);
    if (payload.type === 'httpRequest') {
       // 执行本地的 http 查询更新，原逻辑，建议 vue 使用本身的 emit 来弹出更新相应的组件
    } else if (payload.type === 'data') {
      // handleData(payload.data);
    }else if (payload.type === 'count') {
      // 如果单独订阅了数量，这有数量的更新事情
      console.warn('message type count:', payload.count);
    } else { 
      console.warn('Unknown message type:', payload.type);
    }
  });
}
```

### 示例：订阅多个事件

// 示例：订阅多个事件（如活动ID为 '12345' 的支付更新 和 活动ID为 '67890' 的注册更新）

```JavaScript
// 示例：订阅多个事件（如活动ID为 '12345' 的支付更新 和 活动ID为 '67890' 的注册更新）
subscribeToEvents(['12345:Payment', '67890:Register']);
```

### Uniapp 中使用

#### 步骤 1: 创建 Socket 管理器

我们将创建一个名为 `socketManager.js` 的文件，该文件将包含初始化连接、管理事件监听和发送消息的逻辑。

```JavaScript
import io from 'socket.io-client';

let instance = null;

const SocketService = function(url, appId, clientId, deviceId) {
  if (instance) {
    return instance;
  }

  // 创建 Socket.IO 实例
  this.socket = io(`${url}/${appId}`, {
    extraHeaders: {
      'X-Client-ID': clientId,
      'X-Device-ID': deviceId,
    },
    reconnectionDelayMax: 10000,
    auth: {
      token: "123"
    },
    query: "debug=1" // 启用调试模式
  });

  // 确保单例模式
  instance = this;
};

SocketService.prototype.subscribeToEvents = function(eventTopics) {
  this.socket.emit('subscribe', eventTopics);

  // 处理来自服务器的数据更新
  this.socket.on('dataUpdate', (payload) => {
    if (payload.type === 'httpRequest') {
      // 触发全局事件
      this.$emit(`event:${payload.topic}`, payload.data);
    } else if (payload.type === 'data') {
      // 触发全局事件
      this.$emit(`event:${payload.topic}`, payload.data);
    }  else if (payload.type === 'count') {
      // 如果单独订阅了数量，这有数量的更新事情
      this.$emit(`event:${payload.topic}:count`, payload.count);
    } else {
      console.warn('Unknown message type:', payload.type);
    }
  });
};

SocketService.prototype.subscribeEventCount= function(eventTopics) {
  this.socket.emit('subscribeCount', eventTopics);
};

export default SocketService;
```

#### 步骤 2: 在应用启动时初始化 Socket 连接

在 uni-app 中，我们通常在 `main.js` 中进行全局性的初始化操作。我们将在此处初始化我们的 Socket 管理器。

```JavaScript
import Vue from 'vue';
import App from './App.vue';
import SocketService from './services/socketService';

Vue.config.productionTip = false;

// 创建 Socket.IO 服务实例
const socketService = new SocketService(
  'http://localhost:3000',
  'your-app-id-here',
  'user123',
  'device456'
);
// 普通更新订阅
// 只能在这订阅， 其它地方可能引起重复订阅
socketService.subscribeToEvents(['12345:Payment']); 


new Vue({
  render: h => h(App),
}).$mount('#app');

// 监听全局事件
Vue.prototype.$on = function(event, callback) {
  this.$root.$on(event, callback);
};
Vue.prototype.$off = function(event, callback) {
  this.$root.$off(event, callback);
};
Vue.prototype.$emit = function(event, ...args) {
  this.$root.$emit(event, ...args);
};
```

#### 步骤 3: 在组件中使用

现在，Socket 管理器是全局可用的，您可以在任何组件中通过引入 `socketManager` 来使用它，实现发送事件、监听事件等功能。

```JavaScript
// SomeComponent.vue
<template>
  <div>
    <h1>Payment Status</h1>
    <p>{{ paymentStatus }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      paymentStatus: ''
    };
  },
  mounted() {
    this.subscribeToPayments();
  },
  methods: {
    subscribeToPayments() {
      this.$on('event:12345:Payment', (data) => {
        this.paymentStatus = data.status;
      });
    }
  },
  beforeDestroy() {
    this.$off('event:12345:Payment');
  }
};
</script>
```

#### 解释

1. 订阅事件：
   1. 在组件的 `mounted` 钩子中调用 `subscribeToPayments` 方法订阅支付状态更新。
   2. 使用 `$on` 监听全局事件 `event:12345:Payment`，并在接收到更新时更新组件状态。
2. 销毁监听器：
   1. 在组件销毁前使用 `$off` 移除事件监听器，避免内存泄漏。

# HTTP 通知提交

当你的客户端进行更新，或服务器有内容需要更新的时候，您还可以通过HTTP请求触发通知发送：

```Shell
curl -X POST http://localhost:3000/notify \
     -H 'Content-Type: application/json' \
     -d '{
           "appId": "your-app-id-here",
           "users": ["user123", "user456"],
           "devices": ["device789"],
           "eventTopics": ["12345:Payment", "67890:Register"],
           "eventName": "",  # 可以省略或为空
           "data": {}  # 可以省略或为空
         }'  
 
curl -X POST http://c1.geelevel.com:3000/notify \
     -H 'Content-Type: application/json' \
     -d '{ "appId": "112232", "eventTopics": ["12345:Payment"] }'
```

以上就是实时在线同步系统的客户端集成指南。希望这份文档能帮助您更好地理解和使用本系统。如果您有任何疑问或遇到问题，请查阅相关文档或联系技术支持。