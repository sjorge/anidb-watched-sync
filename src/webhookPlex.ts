import { log } from './webhook';

export async function webhookPlex(req: Request): Promise<Response> {
    log("TODO: handle /plex");
    console.log(await req.json());
    return new Response("TODO handle /plex\n");
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
