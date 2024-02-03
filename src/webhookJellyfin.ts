import { log } from './webhook';

export async function webhookJellyfin(req: Request): Promise<Response> {
    log("TODO: handle /jellyfin");
    console.log(await req.json());
    return new Response("TODO handle /jellyfin\n");
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
