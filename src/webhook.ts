import process from 'node:process';
import { Config, readConfig, validateConfig } from './configure'
import { webhookPlex } from './webhookPlex';
import { webhookJellyfin } from './webhookJellyfin';

export function log(msg: string, type: "error" | "warn" | "step" | "done" | "info" = "info"): void {
    const blank: number = process.stdout.columns ? (process.stdout.columns) : 0;
    switch(type) {
        case "error":
            process.stderr.write(`\r${" ".repeat(blank)}\r[\x1b[31m!!\x1b[0m] ${msg}\n`);
            break;
        case "warn":
            process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[33mWW\x1b[0m] ${msg}\n`);
            break;
        case "info":
            process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[34mII\x1b[0m] ${msg}\n`);
            break;
        case "done":
            process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[32mOK\x1b[0m] ${msg}\n`);
            break;
        case "step":
            process.stdout.write(`\r${" ".repeat(blank)}\r[\x1b[33m>>\x1b[0m] ${msg}`);
            break;
    }
}

export async function webhookAction(): Promise<void> {
    const config: Config = readConfig();
    if(!validateConfig(config)) {
        log("Please run the configure action, configuration not complete.", "error")
        process.exitCode = 1;
        return;
    }

    log("AniDB watched sync v1.0.0");
    const server = Bun.serve({
      port: config.webhook.port,
      hostname: config.webhook.bind,
      async fetch(req: Request) {
        const url = new URL(req.url);

        log(`Received ${req.method} for ${url.pathname} ...`);
        if (req.method == "POST") {
            switch(url.pathname) {
                case "/plex":
                    return webhookPlex(req);
                    break;
                case "/jellyfin":
                    return webhookJellyfin(req);
                    break;
            }
        }

        return new Response(`No request handler for ${url.pathname}`, {status: 404, statusText: "Forbidden"});
      },
    });

    log(`Listening on http://${server.hostname}:${server.port} ...`);
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
