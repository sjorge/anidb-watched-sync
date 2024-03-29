import process from 'node:process';
import { Server } from 'bun';
import { AxiosError } from 'axios';
import { log } from './logger';
import { Config, readConfig } from './configure'
import { Scrobblers } from './scrobbler';
import { ScrobblerAnilist } from './scrobblerAnilist';
import { ScrobblerPlex } from './scrobblerPlex';
import { ScrobblerJellyfin } from './scrobblerJellyfin';
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

    try {
        scrobbler.plex = new ScrobblerPlex(config);
        await scrobbler.plex.init();
    } catch (exception) {
        const err = exception as Error;
        switch(err.message) {
            case "INFO_JELLYFIN_CONFIG":
                log("Disabling Plex mark as watched, incomplete Plex configuration.");
                break;
            case "ERR_PLEX_URL":
                log(`Disabling Plex mark as watched, could not parse URL!`, "error");
                break;
            default:
                log(err.message, "error");
                break;
        }
        scrobbler.jellyfin = undefined;
    }

    try {
        scrobbler.jellyfin = new ScrobblerJellyfin(config);
        await scrobbler.jellyfin.init();
    } catch (exception) {
        const err = exception as Error;
        switch(err.message) {
            case "INFO_JELLYFIN_CONFIG":
                log("Disabling Jellyfin mark as watched, no token configured.");
                scrobbler.jellyfin = undefined;
                break;
            case "ERROR_JELLYFIN_USERID":
                log(`Disabling Jellyfin mark as watched, could not lookup UserId for ${config.jellyfin.user}!`, "error");
                scrobbler.jellyfin = undefined;
                break;
            case "ERROR_JELLYFIN_LIBRARYID":
                log(`Disabling Jellyfin mark as watched, could not lookup LibraryId for ${config.jellyfin.library}!`, "error");
                scrobbler.jellyfin = undefined;
                break;
            default:
                // jellyfin could be temperarily unreachable
                //   do not treat these as fatal and continue, if jellyfin is back later
                //   we can still scrobble.
                if (err.name == "AxiosError") {
                    const ae = err as AxiosError;
                    if (ae.code == "ERR_BAD_RESPONSE") break;
                    if (ae.code == "ETIMEDOUT") break;
                    if (ae.code == "ERR_NETWORK") break;
                }

                log(`Disabling Jellfin mark as watched, ${err.message}`, "error");
                scrobbler.jellyfin = undefined;
                break;
        }
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
