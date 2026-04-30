#!/usr/bin/env node
import('../bundle/index.js').catch((err) => {
  if (err.code === 'ERR_MODULE_NOT_FOUND') {
    // Dev mode fallback — run TypeScript source directly
    import('../src/index.ts').catch((err2) => {
      console.error('Failed to load FIS CLI:', err2)
      process.exit(1)
    })
  } else {
    console.error('Failed to load FIS CLI:', err)
    process.exit(1)
  }
})
