const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const winston = require('winston');
const express = require('express');
const multer = require('multer');
const crc32c = require('fast-crc32c');
const axios = require('axios');
const anilist = require('anilist-node');

const ANIDB_MAPPING_URL = "https://raw.githubusercontent.com/meisnate12/Plex-Meta-Manager-Anime-IDs/master/pmm_anime_ids.json";
const settings = {
        'host': 'localhost',
	'port': 9001,
	'log_level': 'info',
        'anilist_token': null,
        'plex_account': null,
	'plex_library': ['Anime'],
	'mapping': {},
	'mattermost_webhook': null,
	'mattermost_account': null,
	'mattermost_icon_rate': null,
	'mattermost_icon_fail': null,
};

const logger = winston.createLogger({
	transports: [
		new winston.transports.Console({
			level: 'debug',
			handleExceptions: true,
			format: winston.format.combine(
				winston.format.timestamp(),
				winston.format.colorize(),
				winston.format.printf(({ level, message, timestamp, stack }) => {
					return `${timestamp} ${level}: ${message}${stack ? `- ${stack}` : ''}`;
				}),
			),
		}),
	],
	exitOnError: false,
});

const app = express();
const upload = multer({dest: '/tmp'});

app.post('/', upload.single('thumb'), (req, res, next) => {
	// only care about plex webhook requests
	if (!req.headers["user-agent"].startsWith("PlexMediaServer/")) {
		logger.warn(`Ignoring request from user-agent: ${req.headers["user-agent"]}.`);
		res.sendStatus(400);
	}

	// handle plex events
	handleScrobble(JSON.parse(req.body.payload), settings);

	// cleanup thumb
	if (req.file) {
		fs.unlink(req.file.path, (err) => {
			if (err) {
				logger.error(`Failed to unlink uploaded thumbnail: ${req.file.path}`);
			}
		});
	}
	res.sendStatus(200);
});

async function handleScrobble(plex, settings) {
	const anidb_re = /^com.plexapp.agents.hama:\/\/anidb-(\d+)(?:\/\d+\/\d+)?\?lang=(\w+)$/i;
	const reqid = crc32c.calculate(JSON.stringify(plex) + Date.now()).toString("16");

	// filter unwanted events
	const recvlog = (plex.event == "media.scrobble") ? logger.info : logger.debug;
	recvlog(`[${reqid}] Received ${plex.event} for account ${plex.Account.title} ...`);
	if (plex.event != "media.scrobble") {
		logger.debug(`[${reqid}] Ignoring event, type ${plex.event} is not media.scrobble.`);
		return;
	} else if (plex.Account.title != settings.plex_account) {
		logger.debug(
			`[${reqid}] Ignoring event, account ${plex.Account.title} `+ 
			`is not ${settings.plex_account}.`
		);
		return;
	} else if (!settings.plex_library.includes(plex.Metadata.librarySectionTitle)) {
		logger.debug(
			`[${reqid}] Ignoring event, library ${plex.Metadata.librarySectionTitle} ` +
			`is not in ${JSON.stringify(settings.plex_library)}.`
		);
		return;
	} else if (!(
		(plex.Metadata.librarySectionType == "show") &&
		(plex.Metadata.type == "episode")
	)) {
		logger.debug(`[${reqid}] Ignoring event, metadata type is not an episode.`);
		return;
	} else if (!plex.Metadata.guid.startsWith('com.plexapp.agents.hama')) {
		logger.warn(`[${reqid}] Metadata does not contain a com.plexapp.agents.hama GUID, cannot extract anidb id to scrobble!`);
		return;
	}

	// fetch anidb -> anilist mapping
	const mapping = await axios.get(ANIDB_MAPPING_URL);

	// extract anidb id
	const anidb_matches = anidb_re.exec(plex.Metadata.guid);
	if (!anidb_matches || anidb_matches.length != 3) {
		logger.error(`[${reqid}] Unable to extract anidb id!`);
	}
	const anidb_id = anidb_matches[1];
	const anilist_id = (anidb_id in settings.mapping) ? settings.mapping[anidb_id] : mapping.data[anidb_id].anilist_id;
	if (!anilist_id) {
		logger.error(`[${reqid}] Unable to map extracted anidb id ${anidb_id} to an anilist id!`);
		return;
	}
	logger.info(`[${reqid}] Extracted anidb id ${anidb_id} maps to anilist id ${anilist_id}`);
	logger.info(
		`[${reqid}] Media Info: ${plex.Metadata.grandparentTitle} - ` +
		`S${plex.Metadata.parentIndex}E${plex.Metadata.index} - ` +
		`${plex.Metadata.title}`
	);

	// look for media with matching anilist id
	const Anilist = new anilist(settings.anilist_token);
	const anilist_profile = await Anilist.user.getAuthorized();
	const anilist_list = await Anilist.lists.anime(anilist_profile.id);
	for (const list of anilist_list) {
		// only increase progress if in Watching list
		if (list.name == 'Watching') {
			for (const entry of list.entries) {
				if (entry.media.id != anilist_id) continue;

				// sanity check before advancing progress
				if (entry.progress >= plex.Metadata.index) {
					logger.warn(`[${reqid}] skipping update, anilist progress > current episode.`);
					return;
				} else if (entry.media.episodes < plex.Metadata.index) {
					logger.warn(`[${reqid}] skipping update, current episode is > max episodes.`);
					return;
				}

				// create updated entry
				const updatedEntry = { "progress": plex.Metadata.index };
				if (updatedEntry.progress == entry.media.episodes) {
					// mark as completed if episode is final episode
					updatedEntry.status = "COMPLETED";
				}

				// apply update
				const result = await Anilist.lists.updateEntry(entry.id, updatedEntry);
				if (result.status == "COMPLETED") {
					mmRateSeries(settings, plex.Metadata.grandparentTitle, entry.media.siteUrl);
					logger.info(`[${reqid}] marked as ${result.status}.`);
				} else if ((result.status != "CURRENT") || (result.progress != plex.Metadata.index)) {
					mmFailure(
						settings,
						plex.Metadata.grandparentTitle,
						plex.Metadata.parentIndex,
						plex.Metadata.index,
						`Failed to update progress, API returned unexpected result: ${JSON.stringify(result)}`,
					);
					logger.error(`[${reqid}] API call to anilist returned unexpected result: ${JSON.stringify(result)}`);
					return;
				} else {
					logger.info(`[${reqid}] updated progress to ${result.progress}.`);
				}
			}

		// allow Planning -> Watching if episode 1 is played
		} else if (list.name == 'Planning') {
			for (const entry of list.entries) {
				if (entry.media.id != anilist_id) continue;

				if (plex.Metadata.index != 1) {
					logger.warn(`[${reqid}] skipping update, anime on "Planning" list but this is not the first episode.`);
					return;
				}

				// create updated entry
				const updatedEntry = { "progress": plex.Metadata.index, "status": "CURRENT" };

				// apply update
				const result = await Anilist.lists.updateEntry(entry.id, updatedEntry);
				if ((result.status != "CURRENT") || (result.progress != plex.Metadata.index)) {
					mmFailure(
						settings,
						plex.Metadata.grandparentTitle,
						plex.Metadata.parentIndex,
						plex.Metadata.index,
						`Failed to update progress, API returned unexpected result: ${JSON.stringify(result)}`,
					);
					logger.error(`[${reqid}] API call to anilist returned unexpected result: ${JSON.stringify(result)}`);
					return;
				} else {
					logger.info(`[${reqid}] updated progess to ${result.progress} and status to ${result.status}.`);
				}
			}
		}
	}
}

async function mmRateSeries(settings, title, url) {
	if (!settings.mattermost_webhook) return;
	if (!settings.mattermost_account) return;

	await axios.post(settings.mattermost_webhook, {
		"channel": settings.mattermost_account,
		"attachments": [
			{
				"color": "#00cc00",
				"author_name": "Scrobbler",
				"author_icon": settings.mattermost_icon_rate,
				"title": title,
				"text": `This show is now marked as completed, don't forget to [rate](${url}) it!`,
			}
		],
		"fallback": `**${title}** completed, don't forget to [this](${url}) it!`,
	});
}

async function mmFailure(settings, title, season, episode, reason) {
	if (!settings.mattermost_webhook) return;
	if (!settings.mattermost_account) return;

	axios.post(settings.mattermost_webhook, {
		"channel": settings.mattermost_account,
		"attachments": [
			{
				"color": "#dc143c",
				"author_name": "Scrobbler",
				"author_icon": settings.mattermost_icon_fail,
				"title": `${title} - S${season}E${episode}`,
				"text": reason,
			}
		],
		"fallback": `**${title} - S${season}E${episode}** - *${episode}*: ${reason}`,
	});
}

async function start() {
	logger.info('Starting Anilist Plex Webhook Scrobbler ...');

	const args = minimist(process.argv.slice(2))
	if (args.config) {
		try {
			const data = fs.readFileSync(args.config, 'utf8');
			Object.assign(settings, JSON.parse(data));

			logger.debug(`Using settings: ${JSON.stringify(settings)}`);
		} catch (err) {
			logger.error(`Unable to load config file ${args.config}, does not exist!`);
			return;
		}
	} else {
		logger.error('Unable to load config file as no "--config <path>" argument was specified.');
		return;
	}

	logger.transports[0].level = settings.log_level;
	if (settings.plex_account && settings.anilist_token) {
		app.listen(settings.port, settings.host, () => logger.info(`Listening on ${settings.host}:${settings.port}`));
	} else {
		if (!settings.plex_account) {
			logger.error('Missing plex_account, please specify by passing "--plex_account <name>"');
		}
		if (!settings.anilist_token) {
			logger.error('Missing anilist_token, please specify by passing "--anilist_token <name>" (enable debug logging for more info)');
			logger.debug('You can obtain a token by visiting https://anilist.co/settings/developer');
			logger.debug('Click "Create New Client", take note of the client id and specify');
			logger.debug('https://anilist.co/api/v2/oauth/pin as the redirect URL.');
			logger.debug('Approve the token by visiting');
			logger.debug('https://anilist.co/api/v2/oauth/authorize?client_id={clientID}&response_type=token');
			logger.debug('make sure to replace {clientID} with the one you noted down before.');
		}
	}
}

if (require.main === module || require.main.filename.endsWith(path.sep + 'cli.js')) {
	start();
} else {
	module.exports = {start};
}
