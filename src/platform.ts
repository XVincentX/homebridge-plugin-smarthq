import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SmartHQOven } from './platformAccessory';
import getAccessToken from './getAccessToken';
import axios from 'axios';
import ws from 'ws';
import { API_URL, ERD_CODES, KEEPALIVE_TIMEOUT } from './constants';
export type SmartHqContext = {
	axios: typeof axios;
	userId: string;
	device: {
		brand: string;
		model: string;
		serial: string;
		nickname: string;
		applianceId: string;
		features: string[];
	};
};
export class SmartHQPlatform implements DynamicPlatformPlugin {
	public Service: typeof this.api.hap.Service;
	public Characteristic: typeof this.api.hap.Characteristic;

	public readonly accessories: PlatformAccessory<SmartHqContext>[] = [];

	constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
		this.Service = this.api.hap.Service;
		this.Characteristic = this.api.hap.Characteristic;
		this.log.debug('Finished initializing platform:', this.config.name);
		this.api.on('didFinishLaunching', () => {
			log.debug('Executed didFinishLaunching callback');

			this.discoverDevices();
		});
	}

	configureAccessory(accessory: PlatformAccessory<SmartHqContext>) {
		this.log.info('Loading accessory from cache:', accessory.displayName);
		this.accessories.push(accessory);
	}

	async discoverDevices() {
		const token = await getAccessToken(this.config.username, this.config.password);

		axios.defaults.baseURL = API_URL;
		axios.defaults.headers.common = {
			Authorization: `Bearer ${token.access_token}`,
		};

		const wssData = await axios.get('/websocket');
		const connection = new ws(wssData.data.endpoint);

		connection.on('message', data => {
			const obj = JSON.parse(data.toString());
			console.log(obj);

			if (obj.kind === 'publish#erd') {
				const accessory = this.accessories.filter(a => a.context.device.applianceId === obj.item.applianceId);

				if (!accessory) {
					this.log.info('Device not found in my list. Maybe we should rerun this pluing?');
					return;
				}

				if (ERD_CODES[obj.item.erd]) {
					console.log(ERD_CODES[obj.item.erd]);
					console.log(console.log(obj.item.value));
				}
			}
		});

		connection.on('error', err => {
			console.log(err);
		});

		connection.on('close', (_, reason) => {
			console.log('Connection closed');
			console.log(reason.toString());
		});

		connection.on('open', () => {
			connection.send(
				JSON.stringify({
					kind: 'websocket#subscribe',
					action: 'subscribe',
					resources: ['/appliance/*/erd/*'],
				}),
			);

			setInterval(
				() =>
					connection.send(
						JSON.stringify({
							kind: 'websocket#ping',
							id: 'keepalive-ping',
							action: 'ping',
						}),
					),
				KEEPALIVE_TIMEOUT,
			);
		});

		const devices = await axios.get('/appliance');

		for (const device of devices.data.items) {
			const [{ data: details }, { data: features }] = await Promise.all([
				axios.get(`/appliance/${device.applianceId}`),
				axios.get(`/appliance/${device.applianceId}/feature`),
			]);
			const uuid = this.api.hap.uuid.generate(device.jid);
			const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

			if (existingAccessory) {
				// the accessory already exists
				this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

				// if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
				// existingAccessory.context.device = device;
				// this.api.updatePlatformAccessories([existingAccessory]);

				// create the accessory handler for the restored accessory
				// this is imported from `platformAccessory.ts`
				new SmartHQOven(this, existingAccessory);

				// it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
				// remove platform accessories when no longer present
				// this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
				// this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
			} else {
				this.log.info('Adding new accessory:', device.nickname);
				const accessory = new this.api.platformAccessory<SmartHqContext>(device.nickname, uuid);
				accessory.context = { device: { ...details, ...features }, axios, userId: devices.data.userId };
				new SmartHQOven(this, accessory);
				this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
			}
		}
	}
}
