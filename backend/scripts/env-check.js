import { env } from '../src/config/env.js';

const checks = {
  ambiente: env.nodeEnv,
  porta: env.port,
  appUrl: env.appUrl,
  proxyConfiável: env.trustProxy,
  banco: `${env.db.user}@${env.db.host}:${env.db.port}/${env.db.name}`,
  sslBanco: env.db.ssl,
  limiteConexões: env.db.connectionLimit,
  senhaBancoConfigurada: env.db.password.length > 0,
  segredoSessãoConfigurado: env.sessionSecret.length > 0,
  bypassLocal: env.devAuthBypass,
};

console.log(JSON.stringify(checks, null, 2));
