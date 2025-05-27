/**
 * 通知服务类
 * 负责处理所有通知相关的业务逻辑
 */
export class NotificationService {
  constructor(io, logger) {
    this.io = io;
    this.logger = logger;
  }

  /**
   * 发送通知的主要方法
   * @param {Object} notificationData - 通知数据
   * @returns {Promise<Object>} 发送结果
   */
  async sendNotification(notificationData) {
    const {
      appId,
      users,
      devices,
      eventTopics,
      eventName = "dataUpdate",
      data = {}
    } = notificationData;

    // 验证目标存在性
    this._validateTargets(users, devices, eventTopics);

    // 准备通知数据
    const notificationPayload = this._prepareNotificationData(data);
    const namespace = this.io.of(`/${appId}`);

    // 批量发送通知
    const sendTasks = [];
    
    if (users && Array.isArray(users) && users.length > 0) {
      sendTasks.push(this._sendToUsers(namespace, users, eventName, notificationPayload));
    }
    
    if (devices && Array.isArray(devices) && devices.length > 0) {
      sendTasks.push(this._sendToDevices(namespace, devices, eventName, notificationPayload));
    }
    
    if (eventTopics && Array.isArray(eventTopics) && eventTopics.length > 0) {
      sendTasks.push(this._sendToTopics(namespace, eventTopics, eventName, notificationPayload, appId));
    }

    // 并行执行所有发送任务
    await Promise.allSettled(sendTasks);

    // 记录发送统计
    this._logNotificationStats(appId, { users, devices, eventTopics });

    return {
      success: true,
      message: "Notification sent successfully",
      stats: {
        userTargets: users?.length || 0,
        deviceTargets: devices?.length || 0,
        topicTargets: eventTopics?.length || 0
      }
    };
  }

  /**
   * 验证至少存在一个发送目标
   */
  _validateTargets(users, devices, eventTopics) {
    const hasUsers = users && Array.isArray(users) && users.length > 0;
    const hasDevices = devices && Array.isArray(devices) && devices.length > 0;
    const hasTopics = eventTopics && Array.isArray(eventTopics) && eventTopics.length > 0;
    
    if (!hasUsers && !hasDevices && !hasTopics) {
      const error = new Error("At least one of 'users', 'devices', or 'eventTopics' must be provided");
      error.statusCode = 400;
      throw error;
    }
  }

  /**
   * 准备通知数据，设置默认值
   */
  _prepareNotificationData(data) {
    const notificationData = { ...data };
    
    // 确保有type字段
    if (!notificationData.type) {
      notificationData.type = "httpRequest";
    }

    // 添加时间戳
    if (!notificationData.timestamp) {
      notificationData.timestamp = Date.now();
    }

    return notificationData;
  }

  /**
   * 向用户发送通知
   */
  async _sendToUsers(namespace, users, eventName, data) {
    const sendPromises = users.map(user => {
      return new Promise((resolve) => {
        try {
          namespace.in(user).emit(eventName, data);
          resolve({ target: user, success: true });
        } catch (error) {
          this.logger.error(`发送给用户 ${user} 失败:`, error);
          resolve({ target: user, success: false, error: error.message });
        }
      });
    });

    return Promise.allSettled(sendPromises);
  }

  /**
   * 向设备发送通知
   */
  async _sendToDevices(namespace, devices, eventName, data) {
    const sendPromises = devices.map(device => {
      return new Promise((resolve) => {
        try {
          namespace.in(device).emit(eventName, data);
          resolve({ target: device, success: true });
        } catch (error) {
          this.logger.error(`发送给设备 ${device} 失败:`, error);
          resolve({ target: device, success: false, error: error.message });
        }
      });
    });

    return Promise.allSettled(sendPromises);
  }

  /**
   * 向主题发送通知
   */
  async _sendToTopics(namespace, eventTopics, eventName, data, appId) {
    const sendPromises = eventTopics.map(topic => {
      return new Promise((resolve) => {
        try {
          // 为每个主题创建独立的数据副本，避免修改原始数据
          const topicData = { ...data, topic };
          
          namespace.in(topic).emit(eventName, topicData);
          
          this.logger.info(`发送通知到主题: ${topic}, 应用: ${appId}`, {
            topic,
            appId,
            eventName,
            dataKeys: Object.keys(topicData)
          });
          
          resolve({ target: topic, success: true });
        } catch (error) {
          this.logger.error(`发送给主题 ${topic} 失败:`, error);
          resolve({ target: topic, success: false, error: error.message });
        }
      });
    });

    return Promise.allSettled(sendPromises);
  }

  /**
   * 记录通知发送统计
   */
  _logNotificationStats(appId, targets) {
    const stats = {
      appId,
      timestamp: new Date().toISOString(),
      targets: {
        users: targets.users?.length || 0,
        devices: targets.devices?.length || 0,
        topics: targets.eventTopics?.length || 0
      },
      total: (targets.users?.length || 0) + 
             (targets.devices?.length || 0) + 
             (targets.eventTopics?.length || 0)
    };

    this.logger.info('通知发送统计', stats);
  }

  /**
   * 获取命名空间统计信息
   */
  async getNamespaceStats(appId) {
    try {
      const namespace = this.io.of(`/${appId}`);
      const sockets = await namespace.fetchSockets();
      
      return {
        appId,
        connectedSockets: sockets.length,
        rooms: Array.from(namespace.adapter.rooms.keys()),
        roomCount: namespace.adapter.rooms.size
      };
    } catch (error) {
      this.logger.error(`获取命名空间 ${appId} 统计失败:`, error);
      throw error;
    }
  }

  /**
   * 批量发送通知（支持多个应用）
   */
  async sendBatchNotifications(notifications) {
    const results = [];
    
    for (const notification of notifications) {
      try {
        const result = await this.sendNotification(notification);
        results.push({ ...result, appId: notification.appId });
      } catch (error) {
        results.push({
          success: false,
          appId: notification.appId,
          error: error.message
        });
      }
    }

    return {
      success: true,
      totalProcessed: notifications.length,
      successCount: results.filter(r => r.success).length,
      results
    };
  }
} 