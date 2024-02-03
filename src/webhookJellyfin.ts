import { log } from './webhook';
import { Config } from './configure';

export async function webhookJellyfin(config: Config, req: Request, reqid: string): Promise<Response> {
    log("TODO: handle /jellyfin");
    const data = await req.json();
    console.log(data);
    return new Response("TODO handle /jellyfin\n");
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
