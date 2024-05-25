import { Config } from './configure'
import { ScrobbleResult } from './scrobbler';
import PlexAPI from 'plex-api';

const plex_url_re = /^(?<proto>http(?:s?)):\/\/(?<host>[\w\\.-]+)(?::(?<port>\d+))?/i;
export class ScrobblerPlex {
    private config: Config;
    private api: any | undefined;

    public constructor(config: Config) {
        this.config = config;
    }

    public async init(): Promise<void> {
        if (
            (this.config.plex.url == undefined) ||
            (this.config.plex.token == undefined) ||
            (this.config.plex.user == undefined) ||
            (this.config.plex.library.length == 0)
        ) { 
            throw new Error("INFO_PLEX_CONFIG");
        }

        const plex_url_matches = plex_url_re.exec(this.config.plex.url);
        if (!plex_url_matches || plex_url_matches.length < 2) {
            throw new Error("ERR_PLEX_URL");
        }

        this.api = new PlexAPI({
            hostname: plex_url_matches[2],
            port: (plex_url_matches[3] != undefined) ?
                parseInt(plex_url_matches[3]) :
                ((plex_url_matches[1] == "https") ? 443 : 32400),
            https: (plex_url_matches[1] == "https"),
            token: this.config.plex.token,
            options: {
                identifier: "c3afbfaf-1906-4750-8116-1fdcafdf1dbe",
                product: "anidb-watched-sync",
                version: "1.0.0",
            },
        });
    }

    public async progress(aid: number, time: number, episode: number, season: number = 1): Promise<ScrobbleResult> {
        if (this.api == undefined) {
            return {
                success: false,
                log_lvl: "error",
                log_msg: "not initialized!",
            } as ScrobbleResult;
        }

        // GUID format com.plexapp.agents.hama://anidb-<aid>/<season>/<episode>?lang=<metadata_lang>
        const seriesGuid = `com.plexapp.agents.hama://anidb-${aid}?lang=`;
        const seasonGuid = `com.plexapp.agents.hama://anidb-${aid}/${season}?lang=`;
        const episodeGuid = `com.plexapp.agents.hama://anidb-${aid}/${season}/${episode}?lang=`;

        let foundEpisode = false;
        const libraries = await this.api.find("/library/sections", {agent: "com.plexapp.agents.hama"});
        for (const library of libraries) {
            if (!this.config.plex.library.includes(library.title)) continue;
            for (const series of await this.api.find(`/library/sections/${library.key}/all`, {type: "show"})) {
                if (!series.guid.startsWith(seriesGuid)) continue;
                for (const season of await this.api.find(`/library/metadata/${series.ratingKey}/children`, {type: "season"})) {
                    if (!season.guid.startsWith(seasonGuid)) continue;
                    for (const episode of await this.api.find(`/library/metadata/${season.ratingKey}/children`, {type: "episode"})) {
                        if (!episode.guid.startsWith(episodeGuid)) continue;
                        foundEpisode = true;
                        if ((episode.viewCount == undefined) || (episode.viewCount < 1)) {
                            try {
                                await this.api.query(`/:/progress?identifier=com.plexapp.plugins.library&key=${episode.ratingKey}&time=${time}`);
                            } catch (err) {
                                return {
                                    success: false,
                                    log_lvl: "error",
                                    log_msg: `api returned and unexpected error!`,
                                } as ScrobbleResult;
                            }
                        }
                    }
                }
            }
        }

        return (foundEpisode) ? {
            success: true,
            log_lvl: "info",
            log_msg: "successful.",
        } as ScrobbleResult : {
            success: false,
            log_lvl: "warn",
            log_msg: `could not find series with anidb id ${aid} on server.`,
        } as ScrobbleResult;
    }

    public async scrobble(aid: number, episode: number, season: number = 1): Promise<ScrobbleResult> {
        if (this.api == undefined) {
            return {
                success: false,
                log_lvl: "error",
                log_msg: "not initialized!",
            } as ScrobbleResult;
        }

        // GUID format com.plexapp.agents.hama://anidb-<aid>/<season>/<episode>?lang=<metadata_lang>
        const seriesGuid = `com.plexapp.agents.hama://anidb-${aid}?lang=`;
        const seasonGuid = `com.plexapp.agents.hama://anidb-${aid}/${season}?lang=`;
        const episodeGuid = `com.plexapp.agents.hama://anidb-${aid}/${season}/${episode}?lang=`;

        let foundEpisode = false;
        const libraries = await this.api.find("/library/sections", {agent: "com.plexapp.agents.hama"});
        for (const library of libraries) {
            if (!this.config.plex.library.includes(library.title)) continue;
            for (const series of await this.api.find(`/library/sections/${library.key}/all`, {type: "show"})) {
                if (!series.guid.startsWith(seriesGuid)) continue;
                for (const season of await this.api.find(`/library/metadata/${series.ratingKey}/children`, {type: "season"})) {
                    if (!season.guid.startsWith(seasonGuid)) continue;
                    for (const episode of await this.api.find(`/library/metadata/${season.ratingKey}/children`, {type: "episode"})) {
                        if (!episode.guid.startsWith(episodeGuid)) continue;
                        foundEpisode = true;
                        if ((episode.viewCount == undefined) || (episode.viewCount < 1)) {
                            try {
                                await this.api.query(`/:/scrobble?identifier=com.plexapp.plugins.library&key=${episode.ratingKey}`);
                            } catch (err) {
                                return {
                                    success: false,
                                    log_lvl: "error",
                                    log_msg: `api returned and unexpected error!`,
                                } as ScrobbleResult;
                            }
                        }
                    }
                }
            }
        }

        return (foundEpisode) ? {
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
