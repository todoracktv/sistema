// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // El adaptador de Vercel permite tener endpoints en servidor (ej. /api/consulta)
  // y que la app se despliegue correctamente en Vercel.
  adapter: vercel(),
  vite: {
    plugins: [tailwindcss()]
  }
});