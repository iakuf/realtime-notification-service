export default function cors() {
    return async (ctx, next) => {
        ctx.set("Access-Control-Allow-Origin", "*");
        ctx.set("Access-Control-Allow-Methods", "OPTIONS, GET, POST, PUT, PATCH, DELETE");
        ctx.set("Access-Control-Allow-Headers", "Content-Type, Authorization", "user_id", "device_id");
        ctx.set('Access-Control-Max-Age', '86400');

        if (ctx.request.method === "options") {
            ctx.status = 204;
            return;
        }
        await next();
    };
}

