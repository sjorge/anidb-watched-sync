import { log } from './logger';
import { Config } from './configure';
import { Scrobblers } from './scrobbler';

export async function webhookJellyfin(config: Config, scrobbler: Scrobblers, req: Request, reqid: string): Promise<Response> {
    log("TODO: handle /jellyfin");
    const data = await req.json();
    console.log(data);
    return new Response("TODO handle /jellyfin\n");
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
