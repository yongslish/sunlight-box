import http from 'http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({});
const server = http.createServer((req, res) => {
  // 强制修改 Host 头为 localhost，彻底绕过 Vite 所有检查
  req.headers.host = 'localhost:5173';
  proxy.web(req, res, { target: 'http://localhost:5173' });
});

server.listen(5174, () => {
  console.log('✅ 代理服务器运行在 http://localhost:5174');
  console.log('⚠️  请用 ngrok 穿透 5174 端口，而不是 5173！');
});