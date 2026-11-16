import { createApp } from "./app";
import { env } from "./config/env";
import { startParentPurgeScheduler } from "./modules/parent-account/parentAccount.purge";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`PravnyaAdmin backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  startParentPurgeScheduler();
});
