import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'QueueTube',
    description: 'Turns cmd/middle-click on YouTube video links into "Add to queue" instead of opening a new tab.',
    permissions: ['storage', 'scripting'],
    host_permissions: ['*://www.youtube.com/*'],
  },
});
