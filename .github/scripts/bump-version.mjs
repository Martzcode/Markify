import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node .github/scripts/bump-version.mjs <version>')
  process.exit(1)
}

const [major, minor, patch] = version.split('.').map(Number)
const windowsVersion = major >= 2000 ? `${major - 2000}.${minor}.${patch}` : version

const patchJson = (path, mutate) => {
  const file = JSON.parse(readFileSync(path, 'utf8'))
  mutate(file)
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n')
}

patchJson('package.json', (file) => {
  file.version = version
})

patchJson('src-tauri/tauri.conf.json', (file) => {
  file.version = version
  file.bundle.windows ??= {}
  file.bundle.windows.wix ??= {}
  file.bundle.windows.wix.version = windowsVersion
})

writeFileSync(
  'src-tauri/Cargo.toml',
  readFileSync('src-tauri/Cargo.toml', 'utf8').replace(/^version = ".*"$/m, `version = "${version}"`)
)