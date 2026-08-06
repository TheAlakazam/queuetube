export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      (message as { type?: string }).type !== 'get-innertube-context'
    ) {
      return;
    }

    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false });
      return;
    }

    browser.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => (window as any).ytcfg?.get('INNERTUBE_CONTEXT') ?? null,
      })
      .then((results) => {
        const result = results[0]?.result ?? null;
        sendResponse({ ok: Boolean(result), context: result });
      })
      .catch(() => sendResponse({ ok: false }));

    return true;
  });
});
