import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SmartHQOven } from './platformAccessory';
import getAccessToken from './getAccessToken';
import axios from 'axios';
import ws from 'ws';
import { API_URL, ERD_CODES, KEEPALIVE_TIMEOUT } from './constants';
import { access } from 'fs';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class SmartHQPlatform implements DynamicPlatformPlugin {
	public Service: typeof this.api.hap.Service;
	public Characteristic: typeof this.api.hap.Characteristic;

	// this is used to track restored cached accessories
	public readonly accessories: PlatformAccessory[] = [];

	constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
		this.Service = this.api.hap.Service;
		this.Characteristic = this.api.hap.Characteristic;
		this.log.debug('Finished initializing platform:', this.config.name);
		// When this event is fired it means Homebridge has restored all cached accessories from disk.
		// Dynamic Platform plugins should only register new accessories after this event was fired,
		// in order to ensure they weren't added to homebridge already. This event can also be used
		// to start discovery of new accessories.
		this.api.on('didFinishLaunching', () => {
			log.debug('Executed didFinishLaunching callback');
			// run the method to discover / register your devices as accessories
			this.discoverDevices();
		});
	}

	/**
	 * This function is invoked when homebridge restores cached accessories from disk at startup.
	 * It should be used to setup event handlers for characteristics and update respective values.
	 */
	configureAccessory(accessory: PlatformAccessory) {
		this.log.info('Loading accessory from cache:', accessory.displayName);

		// add the restored accessory to the accessories cache so we can track if it has already been registered
		this.accessories.push(accessory);
	}

	async discoverDevices() {
		const token = await getAccessToken(this.config.username, this.config.password);
		const wssData = await axios({
			method: 'GET',
			baseURL: API_URL,
			url: '/websocket',
			headers: {
				Authorization: `Bearer ${token.access_token}`,
			},
		});

		const connection = new ws(wssData.data.endpoint);

		connection.on('message', (data) => {
			const obj = JSON.parse(data.toString());
			console.log(obj);

			if (obj.kind === 'publish#erd') {
				const accessory = this.accessories.filter((a) => a.context.device.applianceId === obj.item.applianceId);

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

		connection.on('error', (err) => {
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

		axios.defaults.baseURL = API_URL;
		axios.defaults.headers.common = {
			Authorization: `Bearer ${token.access_token}`,
		};

		const devices = await axios.get('/appliance');

		// loop over the discovered devices and register each one if it has not already been registered
		for (const device of devices.data.items) {
			const [{ data: details }, { data: features }] = await Promise.all([
				axios.get(`/appliance/${device.applianceId}`),
				axios.get(`/appliance/${device.applianceId}/feature`),
			]);
			// generate a unique id for the accessory this should be generated from
			// something globally unique, but constant, for example, the device serial
			// number or MAC address
			const uuid = this.api.hap.uuid.generate(device.jid);

			// see if an accessory with the same uuid has already been registered and restored from
			// the cached devices we stored in the `configureAccessory` method above
			const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

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
				// the accessory does not yet exist, so we need to create it
				this.log.info('Adding new accessory:', device.nickname);

				// create a new accessory
				const accessory = new this.api.platformAccessory(device.nickname, uuid);

				// store a copy of the device object in the `accessory.context`
				// the `context` property can be used to store any data about the accessory you may need
				accessory.context = { device: { ...details, ...features }, axios };

				// create the accessory handler for the newly create accessory
				// this is imported from `platformAccessory.ts`
				new SmartHQOven(this, accessory);

				// link the accessory to your platform
				this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
			}
		}
	}
}
