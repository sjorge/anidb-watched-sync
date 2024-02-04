import { Config } from './configure'
import { JellyfinMiniApi, JellyfinProviderSeries, JellyfinSeriesEpisodes } from './jellyfin';

export class ScrobblerJellyfin {
    private config: Config;
    private api: JellyfinMiniApi | undefined;
    private userId: string | undefined;
    private libraryId: string | undefined;

    public constructor(config: Config) {
        this.config = config;
    }

    public async init(): Promise<void> {
        if (
            (this.config.jellyfin.url == undefined) ||
            (this.config.jellyfin.apiKey == undefined) ||
            (this.config.jellyfin.user == undefined) ||
            (this.config.jellyfin.library == undefined)
        ) { 
            throw new Error("INFO_JELLYFIN_CONFIG");
        }

        this.api = new JellyfinMiniApi(this.config.jellyfin.url, this.config.jellyfin.apiKey, this.config.jellyfin.caFile);
        const userId = await this.api.getUserId(this.config.jellyfin.user);
        if (userId == undefined) {
            throw new Error("ERROR_JELLYFIN_USERID");
        } else {
            this.userId = userId;
        }

        const libraryId = await this.api.getLibraryId(this.config.jellyfin.library, this.userId);
        if (libraryId == undefined) {
            throw new Error("ERROR_JELLYFIN_LIBRARYID");
        } else {
            this.libraryId = libraryId;
        }
    }

    public async scrobble(aid: number, episode: number, season: number = 1): Promise<boolean> {
        if ((this.api == undefined) || (this.libraryId == undefined) || (this.userId == undefined)) {
            throw new Error("Scrobbler not initialized!!");
        }

        const series: JellyfinProviderSeries = await this.api.getSeriesWithProvider(this.libraryId, this.userId, "anidb");
        if (
            (Object.keys(series).length != 0) ||
            (Object.keys(series).includes(`${aid}`))
        ) {
            const targetSeries = series[`${aid}`];
            if (!targetSeries.completed) { // NOTE: do nothing when targetSeries already marked as completed
                const episodes: JellyfinSeriesEpisodes = await this.api.getEpisodesFromSeries(targetSeries.id, this.userId, season);
                for (let targetEpisode of Object.values(episodes)) {
                    if (targetEpisode.season != season) continue;
                    if (targetEpisode.episode != episode) continue;
                    if (targetEpisode.watched) continue;
                    if (!await this.api.markWatched(targetEpisode.id, this.userId)) {
                        throw new Error("Failed to mark as watched via API!");
                    }
                }
            }
        } else {
            return false;
        }

        return true;
    }
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
