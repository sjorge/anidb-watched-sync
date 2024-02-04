import { ScrobblerJellyfin } from './scrobblerJellyfin';

export type ScrobbleResult = {
    success: boolean;
    log_lvl: "error" | "warn" | "info";
    log_msg: string | undefined;
};

export type Scrobblers = {
    anilist?: ScrobblerJellyfin; // XXX: update once we have a ScrobblerAnilist class
    jellyfin?: ScrobblerJellyfin;
    plex?: ScrobblerJellyfin; // XXX: update once we have a ScrobblerPlex class
};
