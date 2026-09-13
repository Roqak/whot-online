import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const portalDir = path.join(rootDir, 'dist-portal')
const zipFile = path.join(rootDir, 'dist-portal.zip')

console.log('📦 Building portal package...')

// Step 1: Run build:portal
execSync('npm run build:portal', { cwd: rootDir, stdio: 'inherit' })

if (!fs.existsSync(path.join(portalDir, 'index.html'))) {
  console.error('❌ Build failed: dist-portal/index.html was not generated.')
  process.exit(1)
}

// Step 2: Remove old zip if present
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile)
}

// Step 3: Create zip containing dist-portal contents at the root level of archive
console.log('🗜️  Zipping dist-portal contents...')
try {
  execSync(`cd "${portalDir}" && zip -r "${zipFile}" . -x "*.DS_Store"`, { stdio: 'inherit' })
} catch (err) {
  console.error('❌ Failed to create zip:', err)
  process.exit(1)
}

const stats = fs.statSync(zipFile)
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2)

console.log(`\n✅ Successfully generated portal package:`)
console.log(`   File: ${zipFile}`)
console.log(`   Size: ${sizeMb} MB`)
console.log(`\nReady to upload to CrazyGames, Poki, or GameDistribution!`)
