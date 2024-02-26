import { Config } from './configure'
import { ScrobbleResult } from './scrobbler';
import { JellyfinMiniApi, JellyfinProviderSeries, JellyfinSeriesEpisodes } from './jellyfin';

export class ScrobblerJellyfin {
    private config: Config;
    private api: JellyfinMiniApi | undefined;
    private userId: string | undefined;
    private libraryId: string[];

    public constructor(config: Config) {
        this.config = config;
        this.libraryId = [];
    }

    public async init(): Promise<void> {
        if (
            (this.config.jellyfin.url == undefined) ||
            (this.config.jellyfin.apiKey == undefined) ||
            (this.config.jellyfin.user == undefined) ||
            (this.config.jellyfin.library.length == 0)
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

        for (const library of this.config.jellyfin.library) {
            const libraryId = await this.api.getLibraryId(library, this.userId);
            if (libraryId == undefined) {
                throw new Error("ERROR_JELLYFIN_LIBRARYID");
            } else {
                this.libraryId.push(libraryId);
            }
        }
    }

    public async scrobble(aid: number, episode: number, season: number = 1): Promise<ScrobbleResult> {
        if ((this.api == undefined) || (this.libraryId.length == 0) || (this.userId == undefined)) {
            try {
                await this.init();
            } catch (err: unknown) {
                return {
                    success: false,
                    log_lvl: "error",
                    log_msg: "could not initialized jellyfin api!",
                } as ScrobbleResult;
            } finally {
                if ((this.api == undefined) || (this.libraryId.length == 0) || (this.userId == undefined)) {
                    return {
                        success: false,
                        log_lvl: "error",
                        log_msg: "not initialized!",
                    } as ScrobbleResult;
                }
            }
        }

        let foundSeries = false;
        for (const libraryId of this.libraryId) {
            const series: JellyfinProviderSeries = await this.api.getSeriesWithProvider(libraryId, this.userId, "anidb");
            if (Object.keys(series).includes(`${aid}`)) {
                const targetSeries = series[`${aid}`];
                foundSeries = true;
                if (!targetSeries.completed) { // NOTE: do nothing when targetSeries already marked as completed
                    const episodes: JellyfinSeriesEpisodes = await this.api.getEpisodesFromSeries(targetSeries.id, this.userId, season);
                    for (const targetEpisode of Object.values(episodes)) {
                        if (targetEpisode.season != season) continue;
                        if (targetEpisode.episode != episode) continue;
                        if (targetEpisode.watched) continue;
                        if (!await this.api.markWatched(targetEpisode.id, this.userId)) {
                            return {
                                success: false,
                                log_lvl: "error",
                                log_msg: "failed to mark as watched!",
                            } as ScrobbleResult;
                        }
                    }
                }
            }
        }

        return (foundSeries) ? {
            success: true,
            log_lvl: "info",
            log_msg: "successful.",
        } as ScrobbleResult : {
            success: false,
            log_lvl: "warn",
            log_msg: `could not find series with anidb id ${aid} on server.`,
        } as ScrobbleResult;
    }
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
