const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.log(`Smart Cab Allocation server running on http://localhost:${env.port} (${env.nodeEnv})`);
});

