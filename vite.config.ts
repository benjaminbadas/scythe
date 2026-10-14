import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Chemin de publication (ex. /scythe/), fourni par le workflow de déploiement.
  base: process.env.BASE_PATH ?? '/',
  // En local, l'API PHP tourne à part (php -S 127.0.0.1:8787 -t public) : Vite lui relaie les requêtes.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  plugins: [react()],
});
