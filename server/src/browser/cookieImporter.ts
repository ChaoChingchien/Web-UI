import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { execSync } from 'child_process';
import { log } from '../platform';
import type { BrowserContext } from 'playwright-core';

/** AI 提供商域名列表（用于筛选需要导入的 Cookie） */
const AI_DOMAINS = [
  'deepseek.com',
  'chat.openai.com',
  'openai.com',
  'claude.ai',
  'anthropic.com',
  'gemini.google.com',
  'aistudio.google.com',
  'perplexity.ai',
];

/** 查找 Chrome 默认用户目录 */
function findChromeProfile(): string | null {
  const appData = process.env.LOCALAPPDATA;
  if (!appData) return null;
  const candidates = [
    path.join(appData, 'Google', 'Chrome', 'User Data', 'Default'),
    path.join(appData, 'Google', 'Chrome', 'User Data', 'Profile 1'),
    path.join(appData, 'Microsoft', 'Edge', 'User Data', 'Default'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 通过 DPAPI 解密 Chrome 的 AES 加密密钥 */
function getChromeKey(profilePath: string): Buffer | null {
  const localStatePath = path.join(profilePath, '..', 'Local State');
  if (!fs.existsSync(localStatePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(localStatePath, 'utf-8'));
    const b64: string | undefined = raw?.os_crypt?.encrypted_key;
    if (!b64) return null;

    // encrypted_key = base64("DPAPI" + encrypted_bytes)
    const rawKey = Buffer.from(b64, 'base64');
    if (rawKey.length < 5) return null;
    const encrypted = rawKey.slice(5); // 去掉 "DPAPI" 前缀

    // 用 PowerShell 调用 DPAPI Unprotect（当前用户上下文）
    const psScript = [
      `Add-Type -AssemblyName System.Security`,
      `$bytes = [System.Convert]::FromBase64String('${encrypted.toString('base64')}')`,
      `$decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
      `Write-Host ([System.Convert]::ToBase64String($decrypted))`,
    ].join('\n');

    const tmpPs = path.join(os.tmpdir(), `webai-dpapi-${Date.now()}-${process.pid}.ps1`);
    fs.writeFileSync(tmpPs, psScript, 'utf-8');

    let output: string;
    try {
      output = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`,
        { encoding: 'utf8', timeout: 15000 }
      );
    } finally {
      try { fs.unlinkSync(tmpPs); } catch { /* ignore */ }
    }

    const lines = output.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const keyB64 = lines[lines.length - 1]; // 最后一行是输出
    if (!keyB64) return null;

    return Buffer.from(keyB64, 'base64');
  } catch (err) {
    log.debug('[CookieImporter] DPAPI 解密失败:', (err as Error)?.message);
    return null;
  }
}

/** 用 AES-256-GCM 解密 Cookie 值 */
function decryptCookieValue(encrypted: Buffer, key: Buffer): string | null {
  if (encrypted.length < 15) return null;

  // Chrome v10/v11 格式：3 字节版本 + 12 字节 nonce + 密文（含末尾 16 字节 GCM 标签）
  const version = encrypted.slice(0, 3).toString();
  if (version !== 'v10' && version !== 'v11') return null;

  const nonce = encrypted.slice(3, 15);
  const ciphertext = encrypted.slice(15);
  if (ciphertext.length < 16) return null;

  const tag = ciphertext.slice(-16);
  const data = ciphertext.slice(0, -16);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf-8');
  } catch {
    return null;
  }
}

/** 将 Chrome 的 same_site 整数映射为 Playwright 字符串 */
function mapSameSite(value: number | null): 'Strict' | 'Lax' | 'None' {
  // Chrome cookies DB: 0=UNSPECIFIED, 1=NO_RESTRICTION, 2=LAX, 3=STRICT
  switch (value) {
    case 1:  return 'None';
    case 2:  return 'Lax';
    case 3:  return 'Strict';
    default: return 'Lax';
  }
}

export interface CookieImportResult {
  imported: number;
  domains: string[];
}

/** 尝试复制 Chrome Cookie 数据库（先直拷，失败则用 PowerShell 绕开锁） */
function copyCookieDb(src: string, dest: string): boolean {
  // 策略 1: 直接复制
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch { /* fall through */ }

  // 策略 2: 用 PowerShell Copy-Item，可能绕过部分锁
  try {
    execSync(
      `powershell -NoProfile -Command "Copy-Item '${src}' '${dest}' -Force 2>$null"`,
      { timeout: 10000, stdio: 'pipe' }
    );
    return fs.existsSync(dest);
  } catch { /* fall through */ }

  // 策略 3: 直接用 fs.readFileSync 读取（可能被锁拒绝）
  try {
    const data = fs.readFileSync(src);
    fs.writeFileSync(dest, data);
    return true;
  } catch { /* fall through */ }

  // 策略 4: 使用 Volume Shadow Copy 快照绕过 Chrome 独占锁
  try {
    const drive = src[0]; // 盘符，如 C
    const vssScript = [
      `$wmi = Get-WmiObject -List Win32_ShadowCopy`,
      `$result = $wmi.Create("${drive}:\\", "ClientAccessible")`,
      // 等待快照就绪并获取设备路径
      `Start-Sleep -Milliseconds 500`,
      `$shadow = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq $result.ShadowID }`,
      `if (-not $shadow) { exit 1 }`,
      `$devicePath = $shadow.DeviceObject + "\\"`,
      // 从快照中复制文件
      `$srcRel = "${src}" -replace '^[A-Za-z]:\\\\', ''`,
      `$snapSrc = Join-Path $devicePath $srcRel`,
      `Copy-Item $snapSrc "${dest}" -Force`,
      // 清理快照
      `$shadow.Delete()`,
      `Write-Host "VSS_OK"`,
    ].join('\n');

    const tmpPs = path.join(os.tmpdir(), `webai-vss-${Date.now()}.ps1`);
    fs.writeFileSync(tmpPs, vssScript, 'utf-8');
    try {
      const output = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`,
        { encoding: 'utf8', timeout: 30000 }
      );
      return output.includes('VSS_OK') && fs.existsSync(dest);
    } finally {
      try { fs.unlinkSync(tmpPs); } catch { /* ignore */ }
    }
  } catch {
    log.debug('[CookieImporter] VSS 快照复制失败');
  }

  return false;
}

/**
 * 从 Chrome 默认用户目录中读取 AI 提供商相关的 Cookie，
 * 解密后注入到 Playwright 浏览器上下文。
 *
 * 调用时机：启动新浏览器实例后，导航到提供商页面之前。
 */
export async function importChromeCookies(context: BrowserContext): Promise<CookieImportResult> {
  // 1. 查找 Chrome 用户目录
  const profilePath = findChromeProfile();
  if (!profilePath) {
    log.info('[CookieImporter] Chrome 用户目录未找到，跳过 Cookie 导入');
    return { imported: 0, domains: [] };
  }

  // 2. 获取解密密钥
  const aesKey = getChromeKey(profilePath);
  if (!aesKey) {
    log.warn('[CookieImporter] 无法获取 Chrome 加密密钥，跳过导入');
    return { imported: 0, domains: [] };
  }

  // 3. 复制 Cookie 数据库到临时文件（避免 Chrome 锁冲突）
  const dbPath = path.join(profilePath, 'Network', 'Cookies');
  if (!fs.existsSync(dbPath)) {
    log.warn('[CookieImporter] Chrome Cookie 数据库不存在');
    return { imported: 0, domains: [] };
  }

  const tmpDb = path.join(os.tmpdir(), `webai-cookies-${Date.now()}-${process.pid}.sqlite`);
  if (!copyCookieDb(dbPath, tmpDb)) {
    log.warn('[CookieImporter] Cookie 数据库被 Chrome 占用，跳过导入（登录 Cookie 可能不完整）');
    return { imported: 0, domains: [] };
  }

  try {
    // 4. 用 sql.js 读取 Cookie 数据库
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(tmpDb);
    const db = new SQL.Database(new Uint8Array(buffer) as unknown as number[]);

    // 按域名筛选
    const conditions = AI_DOMAINS.map(d => `(host_key LIKE '%.${d}' OR host_key = '${d}')`);
    const sql = `SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly, has_expires, same_site, priority FROM cookies WHERE ${conditions.join(' OR ')}`;

    const stmt = db.prepare(sql);
    const cookies: {
      name: string; value: string; domain: string; path: string;
      expires?: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None';
    }[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;

      const encryptedValue = row.encrypted_value
        ? Buffer.from(row.encrypted_value as Uint8Array)
        : Buffer.alloc(0);

      // 有些 Cookie 的 value 列可直接使用（非加密），优先用 encrypted_value
      let value: string | null = null;
      if (encryptedValue.length > 0) {
        value = decryptCookieValue(encryptedValue, aesKey);
      }
      if (!value) continue;

      const domain = row.host_key as string;
      const expires = (row.has_expires && (row.expires_utc as number) > 0)
        ? Math.floor((row.expires_utc as number) / 1_000_000 - 11644473600)
        : undefined;

      cookies.push({
        name: row.name as string,
        value,
        domain,
        path: (row.path as string) || '/',
        ...(expires ? { expires } : {}),
        httpOnly: !!row.is_httponly,
        secure: !!row.is_secure,
        sameSite: mapSameSite(row.same_site as number | null),
      });
    }
    stmt.free();
    db.close();

    if (cookies.length === 0) {
      log.info('[CookieImporter] 未找到 AI 提供商相关 Cookie');
      return { imported: 0, domains: [] };
    }

    // 5. 注入到 Playwright 上下文
    const domains = [...new Set(cookies.map(c => c.domain.replace(/^\./, '')))];

    try {
      await context.addCookies(cookies);
      log.info(`[CookieImporter] 成功导入 ${cookies.length} 个 Cookie（${domains.join(', ')}）`);
      return { imported: cookies.length, domains };
    } catch {
      // 批量添加失败时逐条尝试
      log.warn(`[CookieImporter] 批量添加失败，逐条尝试 ${cookies.length} 个 Cookie...`);
      let successCount = 0;
      for (const c of cookies) {
        try {
          await context.addCookies([c]);
          successCount++;
        } catch { /* 跳过有问题的 Cookie */ }
      }
      log.info(`[CookieImporter] 导入了 ${successCount}/${cookies.length} 个 Cookie`);
      return { imported: successCount, domains };
    }
  } catch (err) {
    log.error('[CookieImporter] 导入失败:', err);
    return { imported: 0, domains: [] };
  } finally {
    try { fs.unlinkSync(tmpDb); } catch { /* ignore */ }
  }
}
