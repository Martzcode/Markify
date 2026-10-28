import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node .github/scripts/bump-version.mjs <major.minor.patch>')
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

patchJson('package-lock.json', (file) => {
  file.version = version
  if (file.packages?.['']) {
    file.packages[''].version = version
  }
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

// Cargo réécrit cette entrée au prochain build ; on la garde alignée pour que
// `git status` reste propre juste après un bump local.
const cargoLockPath = 'src-tauri/Cargo.lock'
if (existsSync(cargoLockPath)) {
  const lock = readFileSync(cargoLockPath, 'utf8')
  const pattern = /(\[\[package\]\]\nname = "markify"\nversion = ")[^"]*(")/
  if (!pattern.test(lock)) {
    console.warn('bump-version: paquet "markify" introuvable dans src-tauri/Cargo.lock')
  } else {
    writeFileSync(cargoLockPath, lock.replace(pattern, `$1${version}$2`))
  }
}

console.log(`Version appliquée : ${version} (Windows/MSI : ${windowsVersion})`)
