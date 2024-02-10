import { ScrobblerAnilist } from './scrobblerAnilist';
import { ScrobblerJellyfin } from './scrobblerJellyfin';
import { ScrobblerPlex } from './scrobblerPlex';

export type ScrobbleResult = {
    success: boolean;
    log_lvl: "error" | "warn" | "info";
    log_msg: string | undefined;
};

export type Scrobblers = {
    anilist?: ScrobblerAnilist;
    jellyfin?: ScrobblerJellyfin;
    plex?: ScrobblerPlex;
};
