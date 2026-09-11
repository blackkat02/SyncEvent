import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const appRoot = join(__filename, '../../..');
const backendDir = join(__filename, '../..');

const prismaDir = join(backendDir, 'prisma');
const migrationsPath = join(prismaDir, 'migrations');
const lockFilePath = join(migrationsPath, 'migration_lock.toml');
const backupRootDir = join(prismaDir, '.migrations_backup');

let currentProvider = process.env.DB_PROVIDER;

if (!currentProvider) {
  const envPath = join(appRoot, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    const providerMatch = envContent.match(/^DB_PROVIDER\s*=\s*(\w+)/m);
    currentProvider = providerMatch
      ? providerMatch[1].trim().toLowerCase()
      : null;
  }
}

// PostgreSQL is the project's target DB (docs/architecture/
// booking-concurrency.md §0) and schema.prisma ships committed with
// provider = "postgresql", so it's the default when nothing else says
// otherwise. Only testing against MySQL needs an explicit DB_PROVIDER=mysql
// (or a `DB_PROVIDER=mysql` line in .env).
currentProvider = (currentProvider ?? 'postgresql').toLowerCase();

if (
  !currentProvider ||
  (currentProvider !== 'mysql' && currentProvider !== 'postgresql')
) {
  console.error(
    '❌ Error: DB_PROVIDER must be either "mysql" or "postgresql"!',
  );
  process.exit(1);
}

if (!existsSync(backupRootDir)) {
  mkdirSync(backupRootDir, { recursive: true });
}

let lockedProvider = null;
if (existsSync(lockFilePath)) {
  const lockContent = readFileSync(lockFilePath, 'utf8');
  const lockMatch = lockContent.match(/^provider\s*=\s*"(\w+)"/m);
  lockedProvider = lockMatch ? lockMatch[1].trim().toLowerCase() : null;
}

console.log(
  `🔍 [DB-MANAGER] Target: [${currentProvider.toUpperCase()}] | Lock: [${lockedProvider ? lockedProvider.toUpperCase() : 'NONE'}]`,
);

if (lockedProvider && lockedProvider !== currentProvider) {
  const targetBackupDir = join(backupRootDir, lockedProvider);
  if (existsSync(targetBackupDir))
    rmSync(targetBackupDir, { recursive: true, force: true });
  cpSync(migrationsPath, targetBackupDir, { recursive: true });
  rmSync(migrationsPath, { recursive: true, force: true });
  console.log(
    `📦 [BACKUP] Moved [${lockedProvider.toUpperCase()}] migrations to backup.`,
  );
}

if (!existsSync(migrationsPath)) {
  const ourBackupDir = join(backupRootDir, currentProvider);
  if (existsSync(ourBackupDir)) {
    cpSync(ourBackupDir, migrationsPath, { recursive: true });
    rmSync(ourBackupDir, { recursive: true, force: true });
    console.log(
      `🔄 [RESTORE] Restored [${currentProvider.toUpperCase()}] migrations from backup.`,
    );
  } else {
    console.log(
      `🌱 [INIT] No migrations for [${currentProvider.toUpperCase()}]. Prisma will create them.`,
    );
  }
} else {
  console.log(
    `✅ [READY] Migrations match [${currentProvider.toUpperCase()}].`,
  );
}

const schemaPath = join(prismaDir, 'schema.prisma');
const schemaContent = readFileSync(schemaPath, 'utf8');
const updatedSchema = schemaContent.replace(
  /(datasource\s+db\s*\{[^}]*provider\s*=\s*")[^"]*(")/,
  `$1${currentProvider}$2`,
);
if (updatedSchema !== schemaContent) {
  writeFileSync(schemaPath, updatedSchema, 'utf8');
  console.log(
    `✏️  [SCHEMA] Provider set to [${currentProvider.toUpperCase()}].`,
  );
} else {
  console.log(
    `✏️  [SCHEMA] Provider already [${currentProvider.toUpperCase()}], no changes.`,
  );
}
