import { ScrobblerJellyfin } from './scrobblerJellyfin';

export type Scrobblers = {
    anilist?: ScrobblerJellyfin; // XXX: update once we have a ScrobblerAnilist class
    jellyfin?: ScrobblerJellyfin;
    plex?: ScrobblerJellyfin; // XXX: update once we have a ScrobblerPlex class
};
