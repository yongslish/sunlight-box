/**
 * TWA APK 生成脚本 - 使用 @bubblewrap/core API 程序化创建
 *
 * 用法:
 *   node twa-build.js init    - 生成 Android 项目
 *   node twa-build.js build   - 构建 APK
 *
 * 前置条件: 先在 dist/ 目录启动一个本地 server:
 *   npx serve dist -l 4173
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { TwaManifest, TwaGenerator, GradleWrapper, JdkHelper, KeyTool, ConsoleLog, AndroidSdkTools, Config } from '@bubblewrap/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.join(__dirname, 'twa-project');
// Homebrew openjdk 的 macOS 标准路径（需有 Contents/Home/release 文件）
const JDK_PATH = '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk';

const log = new ConsoleLog('twa-build');
const config = new Config(JDK_PATH, null);

// 模拟 process 对象，让 JdkHelper 能在 macOS 上工作
const fakeProcess = { platform: 'darwin', env: process.env };

// ---- TWA 配置 ----
const TWA_CONFIG = {
  packageId: 'com.sunlight.box.twa',
  host: 'https://sunlight-box.netlify.app',  // 部署后改成你的实际域名
  name: '日光盒子',
  launcherName: '日光盒子',
  display: 'standalone',
  themeColor: '#FFF8E7',
  backgroundColor: '#FFF8E7',
  navigationColor: '#1a1a2e',
  startUrl: '/',
  iconUrl: 'http://localhost:4173/icon.svg',
  maskableIconUrl: 'http://localhost:4173/icon.svg',
  splashScreenFadeOutDuration: 300,
  enableNotifications: false,
  fallbackType: 'customtabs',
  orientation: 'default',
  signingKey: {
    path: './android.keystore',
    alias: 'android',
  },
  appVersionName: '1.0.0',
  appVersionCode: 1,
  webManifestUrl: 'http://localhost:4173/manifest.webmanifest',
};

async function generateKeystore() {
  const keystorePath = path.join(PROJECT_DIR, 'android.keystore');
  if (fs.existsSync(keystorePath)) {
    log.info('密钥已存在:', keystorePath);
    return true;
  }

  log.info('正在生成签名密钥...');
  const jdkHelper = new JdkHelper(fakeProcess, config);
  const keyTool = new KeyTool(jdkHelper);

  try {
    await keyTool.createSigningKey({
      path: keystorePath,
      password: 'sunlight123',
      alias: 'android',
      keypassword: 'sunlight123',
      fullName: 'SunLight Box',
      organization: 'SunLight',
      organizationalUnit: 'Dev',
      country: 'CN',
    });
    log.info('密钥已生成:', keystorePath);
    return true;
  } catch (e) {
    log.error('密钥生成失败:', e.message);
    return false;
  }
}

async function initProject() {
  if (!fs.existsSync(PROJECT_DIR)) {
    fs.mkdirSync(PROJECT_DIR, { recursive: true });
  }

  if (!(await generateKeystore())) return;

  const twaManifest = new TwaManifest(TWA_CONFIG);

  const error = twaManifest.validate();
  if (error) {
    log.error('配置验证失败:', error);
    return;
  }

  log.info('正在生成 Android 项目...');
  log.info('  - 包名:', TWA_CONFIG.packageId);
  log.info('  - 域名:', TWA_CONFIG.host);
  log.info('  - 图标:', TWA_CONFIG.iconUrl);

  const generator = new TwaGenerator();
  try {
    await generator.createTwaProject(PROJECT_DIR, twaManifest, log, (current, total) => {
      log.debug(`  生成进度: ${current}/${total}`);
    });
    log.info('✓ Android 项目已生成:', PROJECT_DIR);
    log.info('');
    log.info('下一步: 部署网站后修改 twa-project/twa-manifest.json, 然后运行:');
    log.info('  node twa-build.js build');
  } catch (e) {
    log.error('生成失败:', e.message);
    log.error(e.stack);
  }
}

async function buildApk() {
  const jdkHelper = new JdkHelper(fakeProcess, config);
  const sdk = new AndroidSdkTools(fakeProcess, config, jdkHelper, log);

  log.info('正在初始化 Android SDK...');
  try {
    await sdk.initialize();
  } catch (e) {
    log.error('SDK 初始化失败:', e.message);
    return;
  }

  log.info('正在构建 APK...');
  const gradle = new GradleWrapper(fakeProcess, sdk, PROJECT_DIR);
  try {
    await gradle.assembleRelease();
    log.info('✓ APK 构建成功!');
    log.info('  输出目录: twa-project/app/build/outputs/apk/release/');
  } catch (e) {
    log.error('构建失败:', e.message);
  }
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'init') {
    await initProject();
  } else if (cmd === 'build') {
    await buildApk();
  } else {
    console.log(`
TWA APK 构建工具

用法:
  node twa-build.js init    - 生成 Android 项目  
  node twa-build.js build   - 构建 APK

部署流程:
  1. 部署网站到 Netlify/Vercel/GitHub Pages
  2. 修改 twa-project/twa-manifest.json 中的 host, iconUrl, webManifestUrl
  3. 运行 node twa-build.js build
  4. APK 在 twa-project/app/build/outputs/apk/release/
    `);
  }
}

main().catch((err) => {
  console.error('错误:', err);
  process.exit(1);
});
