import puppeteer, { type Browser } from "puppeteer";

export interface PdfRenderer {
  render(html: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface PuppeteerRendererOptions {
  maxConcurrency: number;
  timeoutMs: number;
  executablePath?: string;
  /** Uniquement en conteneur, compensé par l'isolation décrite dans docs/adr/0005. */
  noSandbox?: boolean;
}

export class PdfTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Rendu PDF interrompu après ${timeoutMs} ms`);
    this.name = "PdfTimeoutError";
  }
}

/** Sémaphore minimal : borne le nombre de pages Chromium ouvertes en même temps. */
class Semaphore {
  private waiting: (() => void)[] = [];
  constructor(private available: number) {}

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
    } else {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    return () => {
      const next = this.waiting.shift();
      if (next) next();
      else this.available++;
    };
  }
}

/**
 * Rendu PDF par Chromium headless. Un navigateur partagé, lancé à la demande et
 * relancé s'il s'est arrêté ; une page par rendu.
 */
export class PuppeteerPdfRenderer implements PdfRenderer {
  private browser: Promise<Browser> | undefined;
  private readonly slots: Semaphore;

  constructor(private readonly options: PuppeteerRendererOptions) {
    this.slots = new Semaphore(options.maxConcurrency);
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const launching = puppeteer.launch({
        headless: true,
        executablePath: this.options.executablePath,
        args: this.options.noSandbox ? ["--no-sandbox"] : [],
      });
      launching.then(
        (browser) => browser.once("disconnected", () => (this.browser = undefined)),
        () => (this.browser = undefined),
      );
      this.browser = launching;
    }
    return this.browser;
  }

  async render(html: string): Promise<Uint8Array> {
    const release = await this.slots.acquire();
    const page = await (await this.getBrowser()).newPage();
    let timer: NodeJS.Timeout | undefined;
    try {
      const work = (async () => {
        await page.setContent(html, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        return page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true });
      })();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PdfTimeoutError(this.options.timeoutMs)), this.options.timeoutMs);
      });
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
      await page.close().catch(() => undefined);
      release();
    }
  }

  async close(): Promise<void> {
    const browser = await this.browser?.catch(() => undefined);
    this.browser = undefined;
    await browser?.close();
  }
}
