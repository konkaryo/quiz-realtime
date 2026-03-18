const { defineConfig } = require('prisma/config')

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
})