/**
 * Punto de entrada del cliente HTTP.
 *
 * El SDK y los tipos se generan desde web/openapi.json con
 * `npm run api:gen` (@hey-api/openapi-ts). No se escriben a mano: si cambia un
 * schema en el backend, se regenera y TypeScript avisa donde haga falta.
 */

import { client } from "./generated/client.gen";

export const BASE_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8080";

// El cliente generado trae baseUrl "openapi.json" (el nombre del fichero de
// entrada); se sustituye por la URL real del backend en runtime.
client.setConfig({ baseUrl: BASE_URL });

export { client };
export * from "./generated";
