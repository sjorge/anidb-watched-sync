import { log } from './logger';
import { Config } from './configure';
import { Scrobblers } from './scrobbler';

export async function webhookJellyfin(config: Config, scrobbler: Scrobblers, req: Request, reqid: string): Promise<Response> {
    if (
        (config.jellyfin.url == undefined) ||
        (config.jellyfin.apiKey == undefined) ||
        (config.jellyfin.user == undefined) ||
        (config.jellyfin.library.length == 0)
    ) {
        return new Response(`[${reqid}] jellyfin: Service Unavailable, not configured.`, {status: 503, statusText: "Service Unavailable"});
    }

    const data = await req.json();
    console.log(data);

    return new Response(`[${reqid}] jellyfin: Bad Request`, {status: 400, statusText: "Bad Request"});
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
