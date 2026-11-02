// 自研博客系统 —— 入口
import { createApp } from './src/app.js';

const PORT = Number(process.env.PORT || 3200);
const app = createApp();

app.listen(PORT, () => {
  console.log(`[blog] 已启动: http://localhost:${PORT}`);
  app.locals.startTasks();
});
