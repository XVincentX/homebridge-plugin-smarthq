import { OAUTH2_CLIENT_ID, OAUTH2_CLIENT_SECRET, OAUTH2_REDIRECT_URI } from './constants';
import { Issuer } from 'openid-client';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { keyBy, mapValues } from 'lodash';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

export default async function getAccessToken(username: string, password: string) {
	const geData = await Issuer.discover('https://accounts.brillion.geappliances.com/');

	const client = new geData.Client({
		client_id: OAUTH2_CLIENT_ID,
		client_secret: OAUTH2_CLIENT_SECRET,
		response_types: ['code'],
	});

	const oauthUrl = client.authorizationUrl();

	const jar = new CookieJar();
	const aclient = wrapper(axios.create({ jar }));
	const htmlPageResponse = await aclient.get(oauthUrl);

	const page = cheerio.load(htmlPageResponse.data);
	const carryInputs = mapValues(
		keyBy(page('#frmsignin').serializeArray(), (o) => o.name),
		(t) => t.value,
	);

	const body = new URLSearchParams({ ...carryInputs, username, password });

	const res = await aclient({
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			origin: 'https://accounts.brillion.geappliances.com',
		},
		url: 'https://accounts.brillion.geappliances.com/oauth2/g_authenticate',
		data: body,
		maxRedirects: 0,
		validateStatus: () => true,
	});

	const u = new URL(res.headers.location);
	const code = u.searchParams.get('code');

	const data = new URLSearchParams({
		code,
		client_id: OAUTH2_CLIENT_ID,
		client_secret: OAUTH2_CLIENT_SECRET,
		redirect_uri: OAUTH2_REDIRECT_URI,
		grant_type: 'authorization_code',
	});

	const r2 = await aclient({
		url: client.issuer.metadata.token_endpoint,
		method: 'POST',
		auth: {
			password: OAUTH2_CLIENT_SECRET,
			username: OAUTH2_CLIENT_ID,
		},
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
		},
		data,
	});

	return r2.data;
}
