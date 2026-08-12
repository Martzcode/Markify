import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) {
  console.error('Usage: node .github/scripts/bump-version.mjs <version>')
  process.exit(1)
}

const packageJsonPath = 'package.json'
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
packageJson.version = version
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')

const tauriConfigPath = 'src-tauri/tauri.conf.json'
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))
tauriConfig.version = version
writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2) + '\n')

const cargoTomlPath = 'src-tauri/Cargo.toml'
writeFileSync(
  cargoTomlPath,
  readFileSync(cargoTomlPath, 'utf8').replace(/^version = ".*"$/m, `version = "${version}"`)
)