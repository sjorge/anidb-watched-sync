import process from 'node:process';
import crc32c from 'fast-crc32c';
import { Config, readConfig } from './configure'
import { webhookPlex } from './webhookPlex';
import { webhookJellyfin } from './webhookJellyfin';
import { JellyfinMiniApi } from './jellyfin';

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
    if (
        (config.jellyfin.url == undefined) ||
        (config.jellyfin.apiKey == undefined) ||
        (config.jellyfin.user == undefined) ||
        (config.jellyfin.library == undefined) ||
        (config.plex.url == undefined) ||
        (config.plex.token == undefined) ||
        (config.plex.user == undefined) ||
        (config.plex.library == undefined)
    ) {
        log("Please run the configure action, configuration not complete.", "error")
        process.exitCode = 1;
        return;
    }

    log("AniDB watched sync v1.0.0");

    // setup jellyfin api
    const jf = new JellyfinMiniApi(config.jellyfin.url, config.jellyfin.apiKey, config.jellyfin.caFile);
    log(`Looking up Jellyfin UserId for user ${config.jellyfin.user} ...`, "step");
    const userId = await jf.getUserId(config.jellyfin.user);
    if (userId == undefined) {
        log(`Failed to lookup Jellyfin UserId for ${config.jellyfin.user}!`, "error");
        process.exitCode = 1;
        return;
    }
    log(`Found Jellyfin UserId ${userId} for ${config.jellyfin.user}.`, "done");

    log(`Looking up Jellyfin LibraryId for ${config.jellyfin.library} ...`, "step");
    const libraryId = await jf.getLibraryId(config.jellyfin.library, userId);
    if (libraryId == undefined) {
        log(`Failed to lookup Jellyfin LibraryId for ${config.jellyfin.library}!`, "error");
        process.exitCode = 1;
        return;
    }
    log(`Found Jellyfin LibraryId ${libraryId} for ${config.jellyfin.library}.`, "done");

    // start webhook server
    const server = Bun.serve({
      port: config.webhook.port,
      hostname: config.webhook.bind,
      async fetch(req: Request) {
        const url = new URL(req.url);
        const reqid = crc32c.calculate(`${Date.now()}_${url}`).toString(16);

        log(`[${reqid}] webhook ${req.method} ${url.pathname} ...`);
        if (req.method == "POST") {
            switch(url.pathname) {
                case "/plex":
                    return webhookPlex(config, req, reqid, jf, userId, libraryId);
                    break;
                case "/jellyfin":
                    return webhookJellyfin(config, req, reqid);
                    break;
            }
        }

        return new Response(`No request handler for ${url.pathname}`, {status: 404, statusText: "Forbidden"});
      },
    });

    log(`Listening on http://${server.hostname}:${server.port} ...`);
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
