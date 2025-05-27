import { validate } from '../middlewares/validation.js';

/**
 * 通知接口参数验证模式
 */
export const notifySchema = {
  type: "object",
  properties: {
    appId: { type: "string", minLength: 1, maxLength: 100 },
    users: { 
      type: "array", 
      items: { type: "string" },
      maxItems: 1000
    },
    devices: { 
      type: "array", 
      items: { type: "string" },
      maxItems: 1000
    },
    eventTopics: { 
      type: "array", 
      items: { type: "string" },
      maxItems: 100
    },
    eventName: { type: "string", maxLength: 100 },
    data: { type: "object" }
  },
  required: ["appId"],
  additionalProperties: false
};

/**
 * 批量通知验证模式
 */
export const batchNotifySchema = {
  type: "object",
  properties: {
    notifications: {
      type: "array",
      items: notifySchema,
      minItems: 1,
      maxItems: 100
    }
  },
  required: ["notifications"],
  additionalProperties: false
};

/**
 * 配置通知相关路由
 * @param {Object} app - uWebKoa应用实例
 * @param {NotificationController} controller - 通知控制器实例
 */
export function setupNotificationRoutes(app, controller) {
  // 单个通知发送
  app.post('/notify', 
    validate(notifySchema, 'body'), 
    controller.sendNotification.bind(controller)
  );

  // 批量通知发送
  app.post('/batch-notify', 
    validate(batchNotifySchema, 'body'), 
    controller.sendBatchNotifications.bind(controller)
  );

  // 获取应用统计
  app.get('/stats/:appId', 
    controller.getAppStats.bind(controller)
  );

  // 健康检查
  app.get('/health', 
    controller.healthCheck.bind(controller)
  );

  // API文档端点
  app.get('/api-docs', async (ctx) => {
    ctx.status = 200;
    ctx.body = {
      title: "实时通知服务 API",
      version: "1.0.0",
      endpoints: [
        {
          method: "POST",
          path: "/notify",
          description: "发送单个通知",
          schema: notifySchema
        },
        {
          method: "POST", 
          path: "/batch-notify",
          description: "批量发送通知",
          schema: batchNotifySchema
        },
        {
          method: "GET",
          path: "/stats/:appId",
          description: "获取应用统计信息"
        },
        {
          method: "GET",
          path: "/health",
          description: "健康检查"
        }
      ]
    };
  });
} 