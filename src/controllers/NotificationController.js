/**
 * 通知控制器
 * 处理HTTP请求和响应，调用服务层处理业务逻辑
 */
export class NotificationController {
  constructor(notificationService, logger) {
    this.notificationService = notificationService;
    this.logger = logger;
  }

  /**
   * 发送单个通知
   */
  async sendNotification(ctx) {
    const requestData = ctx.request.body;
    
    // 记录请求
    this.logger.info('收到通知发送请求:', {
      appId: requestData.appId,
      userCount: requestData.users?.length || 0,
      deviceCount: requestData.devices?.length || 0,
      topicCount: requestData.eventTopics?.length || 0,
      eventName: requestData.eventName
    });

    try {
      const result = await this.notificationService.sendNotification(requestData);
      
      ctx.status = 200;
      ctx.body = result;
    } catch (error) {
      // 直接处理业务逻辑错误，不抛出
      this.logger.error('通知控制器捕获到错误:', {
        message: error.message,
        statusCode: error.statusCode,
        errorType: typeof error.statusCode
      });
      
      // 根据错误类型设置不同的状态码
      if (error.statusCode && typeof error.statusCode === 'number') {
        ctx.status = error.statusCode;
      } else {
        ctx.status = 500;
      }
      
      ctx.body = {
        success: false,
        error: error.message || 'Internal server error'
      };
    }
  }

  /**
   * 批量发送通知
   */
  async sendBatchNotifications(ctx) {
    const { notifications } = ctx.request.body;
    
    if (!Array.isArray(notifications) || notifications.length === 0) {
      const error = new Error('notifications must be a non-empty array');
      error.statusCode = 400;
      throw error;
    }

    this.logger.info('收到批量通知发送请求:', {
      count: notifications.length,
      appIds: [...new Set(notifications.map(n => n.appId))]
    });

    const result = await this.notificationService.sendBatchNotifications(notifications);
    
    ctx.status = 200;
    ctx.body = result;
  }

  /**
   * 获取应用统计信息
   */
  async getAppStats(ctx) {
    const { appId } = ctx.params;
    
    if (!appId) {
      const error = new Error('appId is required');
      error.statusCode = 400;
      throw error;
    }

    const stats = await this.notificationService.getNamespaceStats(appId);
    
    ctx.status = 200;
    ctx.body = {
      success: true,
      data: stats
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(ctx) {
    ctx.status = 200;
    ctx.body = {
      success: true,
      message: 'Notification service is healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
} 