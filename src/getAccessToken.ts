import * as constants from "./constants";
import { Issuer } from "openid-client";
import axios from "axios";
import * as cheerio from "cheerio";
import { keyBy, mapValues } from "lodash";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

export default async function getAccessToken(username: string, password: string) {
  const geData = await Issuer.discover(
    "https://accounts.brillion.geappliances.com/"
  );

  const client = new geData.Client({
    client_id: constants.OAUTH2_CLIENT_ID,
    client_secret: constants.OAUTH2_CLIENT_SECRET,
    response_types: ["code"],
  });

  const oauthUrl = client.authorizationUrl();

  const jar = new CookieJar();
  const aclient = wrapper(axios.create({ jar }));
  const htmlPageResponse = await aclient.get(oauthUrl);

  const page = cheerio.load(htmlPageResponse.data);
  const carryInputs = mapValues(
    keyBy(page("#frmsignin").serializeArray(), (o) => o.name),
    (t) => t.value
  );

  const body = new URLSearchParams();

  for (var key in carryInputs) {
    body.append(key, carryInputs[key]);
  }

  body.set("username", username);
  body.set("password", password);

  const res = await aclient({
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://accounts.brillion.geappliances.com",
    },
    url: "https://accounts.brillion.geappliances.com/oauth2/g_authenticate",
    data: body,
    maxRedirects: 0,
  });

  const u = new URL(res.headers.location);
  const code = u.searchParams.get("code");

  const data = new URLSearchParams();

  data.set("code", code);
  data.set("client_id", constants.OAUTH2_CLIENT_ID);
  data.set("client_secret", constants.OAUTH2_CLIENT_SECRET);
  data.set("redirect_uri", constants.OAUTH2_REDIRECT_URI);
  data.set("grant_type", "authorization_code");

  const r2 = await aclient({
    url: client.issuer.metadata.token_endpoint,
    method: "POST",
    auth: {
      password: constants.OAUTH2_CLIENT_SECRET,
      username: constants.OAUTH2_CLIENT_ID,
    },
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    data,
  });

  return r2.data;
}
