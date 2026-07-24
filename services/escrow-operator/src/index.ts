import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const app = buildApp(config);

app.listen(config.port, () => {
  console.log(
    `Escrow operator listening on port ${config.port} (pubkey: ${config.escrowPubkey})`,
  );
});
