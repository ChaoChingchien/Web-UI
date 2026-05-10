/**
 * 检查所有提供商页面的实际 DOM 结构
 * 截取截图并输出关键选择器可用性
 */
import { BrowserManager } from '../src/browser/BrowserManager';
import { ProviderModel } from '../src/database/models';
import { log } from '../src/platform';

async function main() {
  const bm = BrowserManager.getInstance();
  await bm.launch();

  const providers = ProviderModel.findAll();
  const webProviders = providers.filter(p => p.type === 'web' && p.url);

  for (const p of webProviders) {
    console.log(`\n========== ${p.name} (${p.id}) ==========`);
    console.log(`URL: ${p.url}`);

    try {
      const page = await bm.getPage(p);

      // 截图
      await page.screenshot({ path: `screenshots/${p.id}.png`, fullPage: true });
      console.log(`截图已保存: screenshots/${p.id}.png`);

      // 检查页面标题和 URL
      const title = await page.title().catch(() => 'N/A');
      console.log(`标题: ${title}`);
      console.log(`当前 URL: ${page.url()}`);

      // 列出所有可见按钮
      const buttons = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, [role="tab"], [role="button"], a[class*="tab"]');
        const result: { tag: string; text: string; class: string; visible: boolean; rect: string }[] = [];
        btns.forEach(b => {
          const rect = b.getBoundingClientRect();
          const style = window.getComputedStyle(b);
          result.push({
            tag: b.tagName,
            text: (b.textContent || '').trim().substring(0, 50),
            class: (b.className || '').substring(0, 80),
            visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
            rect: `${Math.round(rect.width)}x${Math.round(rect.height)} at (${Math.round(rect.left)},${Math.round(rect.top)})`,
          });
        });
        return result.filter(b => b.visible && b.text.length > 0);
      });

      console.log('\n--- 可见按钮 ---');
      for (const b of buttons.slice(0, 40)) {
        console.log(`  [${b.tag}] "${b.text}" | ${b.class.substring(0, 60)} | ${b.rect}`);
      }

      // 检查输入框
      const inputs = await page.evaluate(() => {
        const els = document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]');
        return Array.from(els).map(el => ({
          tag: el.tagName,
          placeholder: (el as HTMLTextAreaElement).placeholder || '',
          class: (el.className || '').substring(0, 80),
          rect: (() => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })(),
        }));
      });
      console.log('\n--- 输入框 ---');
      for (const inp of inputs) {
        console.log(`  [${inp.tag}] placeholder="${inp.placeholder}" | ${inp.class.substring(0, 60)} | ${inp.rect}`);
      }

      // 检查 modeSelector 容器
      const cfg = p.web_config as any;
      if (cfg?.modeSelector?.container) {
        const modeEl = await page.$(cfg.modeSelector.container);
        console.log(`\n--- 模式选择器 (${cfg.modeSelector.container}) ---`);
        if (modeEl) {
          const text = await modeEl.textContent();
          console.log(`  找到容器: "${(text || '').trim().substring(0, 100)}"`);
        } else {
          console.log(`  未找到容器`);
        }
      }

      if (cfg?.modelSelector?.container) {
        const modelEl = await page.$(cfg.modelSelector.container);
        console.log(`\n--- 模型选择器 (${cfg.modelSelector.container}) ---`);
        if (modelEl) {
          const text = await modelEl.textContent();
          console.log(`  找到容器: "${(text || '').trim().substring(0, 100)}"`);
        } else {
          console.log(`  未找到容器`);
        }
      }

    } catch (err) {
      console.error(`错误: ${err}`);
    }
  }

  console.log('\n========== 完成 ==========');
}

main().catch(console.error);
