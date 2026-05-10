import type { Application } from 'express';
import settingsRouter from './settings';
import searchRouter from './search';
import exportRouter from './export';
import conversationsRouter from './conversations';
import providersRouter from './providers';
import rolesRouter from './roles';
import teamsRouter from './teams';
import tasksRouter from './tasks';
import claudeRouter from './claude';

export function registerRoutes(app: Application): void {
  app.use(settingsRouter);
  app.use(searchRouter);
  app.use(exportRouter);
  app.use(conversationsRouter);
  app.use(providersRouter);
  app.use(rolesRouter);
  app.use(teamsRouter);
  app.use(tasksRouter);
  app.use(claudeRouter);

  // 调试：截取提供商页面截图 + 测试选择器 (仅开发环境)
  app.get('/api/debug/screenshot/:providerId', async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
    try {
      const { ProviderModel } = await import('../database/models');
      const { BrowserManager } = await import('../browser/BrowserManager');
      const provider = ProviderModel.findById(req.params.providerId);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
      const bm = BrowserManager.getInstance();
      await bm.launch();
      const page = await bm.getPage(provider);
      await page.waitForTimeout(3000);

      // 测试 conversationStart（如果配置了）
      let conversationStarted = false;
      const wc = (provider.web_config || {}) as any;
      if (wc.conversationStart) {
        const { AutomationEngine } = await import('../browser/automation/AutomationEngine');
        const engine = new AutomationEngine(page, provider);
        await engine.startConversation();
        conversationStarted = true;
        await page.waitForTimeout(2000);
      }

      const path = `screenshots/${provider.id}.png`;
      await page.screenshot({ path, fullPage: false });

      // 使用 Playwright 引擎测试选择器（支持 :has-text() 等）
      const result: Record<string, { found: number; text: string }> = {};

      if (wc.modeSelector) {
        const ms = wc.modeSelector;
        const containerCount = await page.locator(ms.container).count();
        const containerText = containerCount > 0 ? await page.locator(ms.container).first().textContent().catch(() => '') : '';
        result['modeContainer'] = { found: containerCount, text: (containerText || '').trim().substring(0, 100) };
        for (const btn of ms.buttons) {
          const count = await page.locator(btn.selector).count();
          const txt = count > 0 ? await page.locator(btn.selector).first().textContent().catch(() => '') : '';
          result[`modeBtn:${btn.name}`] = { found: count, text: (txt || '').trim().substring(0, 60) };
        }
      }

      if (wc.modelSelector) {
        const mls = wc.modelSelector;
        const containerCount = await page.locator(mls.container).count();
        const containerText = containerCount > 0 ? await page.locator(mls.container).first().textContent().catch(() => '') : '';
        result['modelContainer'] = { found: containerCount, text: (containerText || '').trim().substring(0, 100) };
        for (const btn of mls.buttons) {
          const count = await page.locator(btn.selector).count();
          const txt = count > 0 ? await page.locator(btn.selector).first().textContent().catch(() => '') : '';
          result[`modelBtn:${btn.name}`] = { found: count, text: (txt || '').trim().substring(0, 60) };
        }
      }

      if (wc.toggles) {
        for (const t of wc.toggles) {
          const count = await page.locator(t.selector).count();
          const txt = count > 0 ? await page.locator(t.selector).first().textContent().catch(() => '') : '';
          result[`toggle:${t.label}`] = { found: count, text: (txt || '').trim().substring(0, 60) };
        }
      }

      // 测试输入框/发送按钮
      if (wc.selectors) {
        for (const key of ['input', 'sendButton', 'responseContainer'] as const) {
          const s = (wc.selectors as any)[key];
          if (s) {
            const count = await page.locator(s).count();
            result[`selector:${key}`] = { found: count, text: count > 0 ? s.substring(0, 60) : '' };
          }
        }
      }

      // 页面基本信息
      const pageUrl = page.url();
      const pageTitle = await page.title().catch(() => '');
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || '').catch(() => '');

      // 详细 DOM 分析 — 找所有可见的交互元素
      const domInfo = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], a, input, textarea, div[contenteditable]'));
        return btns.map(b => {
          const r = b.getBoundingClientRect();
          const s = window.getComputedStyle(b);
          return {
            tag: b.tagName,
            text: (b.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 60),
            visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden',
          };
        }).filter(b => b.visible && b.text);
      });

      // 查找所有输入类元素
      const inputElements = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input, textarea, div[contenteditable], [role="textbox"], [contenteditable], form');
        return Array.from(inputs).map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          role: el.getAttribute('role') || '',
          id: el.id,
          className: (el.className || '').toString().substring(0, 60),
          placeholder: el.getAttribute('placeholder') || '',
          contenteditable: el.getAttribute('contenteditable') || '',
          visible: el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0,
        })).filter(el => el.visible);
      });

      res.json({ screenshot: path, url: pageUrl, title: pageTitle, bodyText, inputElements, conversationStarted, selectorMatch: result, visibleButtons: domInfo });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // 调试：测试完整的自动化流程（仅开发环境）
  app.post('/api/debug/test-automation/:providerId', async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
    try {
      const { ProviderModel } = await import('../database/models');
      const { BrowserManager } = await import('../browser/BrowserManager');
      const { AutomationEngine } = await import('../browser/automation/AutomationEngine');
      const provider = ProviderModel.findById(req.params.providerId);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
      const message = req.body.message || '你好';

      const bm = BrowserManager.getInstance();
      await bm.launch();
      const page = await bm.getPage(provider);
      const engine = new AutomationEngine(page, provider);

      // Phase 1: 启动对话
      const startUrl = page.url();
      await engine.startConversation();
      const afterStartUrl = page.url();
      const startScreenshot = `screenshots/${provider.id}_after_start.png`;
      await page.screenshot({ path: startScreenshot });

      // Phase 2: 填写输入
      await page.waitForTimeout(1000);
      const inputSelector = (provider.web_config as any)?.selectors?.input || '';
      const inputCount = inputSelector ? await page.locator(inputSelector).count() : 0;
      const inputScreenshot = `screenshots/${provider.id}_before_send.png`;
      await page.screenshot({ path: inputScreenshot });

      // Phase 3: 发送消息
      const fillScreenshot = `screenshots/${provider.id}_filled.png`;
      await engine.fillInput(message);
      await page.screenshot({ path: fillScreenshot });

      const preSendUrl = page.url();
      await engine.clickSend();
      const postSendUrl = page.url();
      const afterSendScreenshot = `screenshots/${provider.id}_after_send.png`;
      await page.screenshot({ path: afterSendScreenshot });

      // Phase 4: 等待响应 (10秒超时用于诊断)
      const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      const postSendInfo = {
        urlChanged: preSendUrl !== postSendUrl,
        preUrl: preSendUrl?.substring(0, 80),
        postUrl: postSendUrl?.substring(0, 80),
        pageTextLength: pageText.length,
        pageTextPreview: pageText.substring(0, 300),
      };

      res.json({
        success: true,
        screenshots: { start: startScreenshot, input: inputScreenshot, filled: fillScreenshot, afterSend: afterSendScreenshot },
        phases: {
          startConversation: {
            urlChanged: startUrl !== afterStartUrl,
            from: startUrl?.substring(0, 80),
            to: afterStartUrl?.substring(0, 80),
          },
          input: {
            selector: inputSelector,
            found: inputCount,
            message,
          },
          send: {
            preSendUrl: preSendUrl?.substring(0, 80),
            postSendUrl: postSendUrl?.substring(0, 80),
            urlChanged: preSendUrl !== postSendUrl,
          },
          postSend: postSendInfo,
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}
