/**
 * Endereço da API, definido na hora do empacotamento por EXPO_PUBLIC_API_URL
 * (ver .env.example). Não é segredo: o app não guarda nenhuma chave.
 * Sem a variável, usa a API local do compose (no emulador Android, defina
 * http://10.0.2.2:3000).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
