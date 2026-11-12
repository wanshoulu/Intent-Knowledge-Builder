const path = require('node:path');
const { createRuntimeServer } = require('./http');

const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '0.0.0.0';
const databasePath = process.env.DATABASE_PATH ||
  path.join(process.cwd(), 'data', 'xiaoi-runtime.db');
const runtime = createRuntimeServer({ databasePath });

runtime.listen(port, host).then(() => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'xiaoi-runtime started',
    host,
    port,
    databasePath
  }));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function shutdown() {
  try {
    await runtime.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
