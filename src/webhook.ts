import process from 'node:process';
import { Server } from 'bun';
import { log } from './logger';
import { Config, readConfig } from './configure'
import { Scrobblers } from './scrobbler';
import { ScrobblerJellyfin } from './scrobblerJellyfin';
import { ScrobblerAnilist } from './scrobblerAnilist';
import { webhookPlex } from './webhookPlex';
import { webhookJellyfin } from './webhookJellyfin';

export async function webhookAction(): Promise<void> {
    log("AniDB watched sync v1.0.0");
    const config: Config = readConfig();
    const scrobbler: Scrobblers = {};

    // setup scrobblers
    try {
        scrobbler.anilist = new ScrobblerAnilist(config);
        await scrobbler.anilist.init();
    } catch (exception) {
        const err = exception as Error;
        switch(err.message) {
            case "INFO_ANILIST_CONFIG":
                log("Disabling Anilist scrobbling, no token configured.");
                break;
            case "ERR_ANILIST_PROFILE":
                log(`Disabling Anilist scrobbling, could not retrieve profile!`, "error");
                break;
            default:
                log(err.message, "error");
                break;
        }
        scrobbler.anilist = undefined;
    }

    if (
        (config.plex.url == undefined) ||
        (config.plex.token == undefined) ||
        (config.plex.user == undefined) ||
        (config.plex.library == undefined)
    ) {
        log("Disabling Plex mark as watched, incomplete Plex configuration.");
    }

    try {
        scrobbler.jellyfin = new ScrobblerJellyfin(config);
        await scrobbler.jellyfin.init();
    } catch (exception) {
        const err = exception as Error;
        switch(err.message) {
            case "INFO_JELLYFIN_CONFIG":
                log("Disabling Jellyfin mark as watched, no token configured.");
                break;
            case "ERROR_JELLYFIN_USERID":
                log(`Disabling Jellyfin mark as watched, could not lookup UserId for ${config.jellyfin.user}!`, "error");
                break;
            case "ERROR_JELLYFIN_LIBRARYID":
                log(`Disabling Jellyfin mark as watched, could not lookup LibraryId for ${config.jellyfin.library}!`, "error");
                break;
            default:
                log(err.message, "error");
                break;
        }
        scrobbler.jellyfin = undefined;
    }

    // require at least one scrobbling target
    if (
        (scrobbler.anilist == undefined) &&
        (scrobbler.jellyfin == undefined) &&
        (scrobbler.plex == undefined)
    ) {
        log("Please run the configure action, configuration not complete.", "error")
        process.exitCode = 1;
        return;
    }

    // start webhook server
    const server: Server = Bun.serve({
      port: config.webhook.port,
      hostname: config.webhook.bind,
      async fetch(req: Request) {
        const url = new URL(req.url);
        const clientIP = server.requestIP(req);
        const clientIPPrintable = (clientIP?.family == "IPv6") ?
            `[${clientIP?.address}]:${clientIP?.port}` :
            `${clientIP?.address}:${clientIP?.port}`;
        const reqid = Bun.hash.crc32(`${Date.now()}_${url}_${clientIPPrintable}`).toString(16);

        log(`[${reqid}] webhook: ${req.method} ${url.pathname} from ${clientIPPrintable}`);
        if (req.method == "POST") {
            switch(url.pathname) {
                case "/plex":
                    return webhookPlex(config, scrobbler, req, reqid);
                    break;
                case "/jellyfin":
                    return webhookJellyfin(config, scrobbler, req, reqid);
                    break;
            }
        }

        return new Response(`No request handler for ${url.pathname}`, {status: 404, statusText: "Forbidden"});
      },
    });

    log(`Listening on http://${server.hostname}:${server.port} ...`);
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
