import 'dotenv/config';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`Configuration error: ${err.message}. See .env.example.`);
    process.exit(1);
  }
  throw err;
}

const app = createApp(config);

app.listen(config.port, (err) => {
  if (err) {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
  console.log(`Listening on port ${config.port} (provider: ${config.provider}, model: ${config.model})`);
});
