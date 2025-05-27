/**
 * 统一错误处理中间件
 */
export const errorHandler = (logger) => {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      // 记录错误日志
      logger.error('请求处理错误:', {
        method: ctx.method,
        url: ctx.url,
        error: error.message,
        statusCode: error.statusCode,
        body: ctx.request.body
      });

      // 设置响应状态码
      ctx.status = error.statusCode || 500;

      // 设置错误响应体
      ctx.body = {
        success: false,
        error: error.message || 'Internal server error'
      };

      // 确保响应头正确设置
      ctx.type = 'application/json';
    }
  };
}; 