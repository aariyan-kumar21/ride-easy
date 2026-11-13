const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { initSocket } = require('./sockets/socket.handler');

let server;

async function startServer() {
  server = http.createServer(app);
  initSocket(server);
  server.listen(env.port, () => {
    console.log(`Smart Cab Allocation server running on http://localhost:${env.port} (${env.nodeEnv}) [In-Memory Storage]`);
  });
}

async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

startServer();
