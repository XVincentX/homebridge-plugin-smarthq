import type { PlatformAccessory } from 'homebridge';
import { ERD_TYPES } from './constants';
import { SmartHQPlatform } from './platform';
import type { SmartHqContext } from './platform';
import axios from 'axios';

export class SmartHQOven {
	constructor(
		private readonly platform: SmartHQPlatform,
		private readonly accessory: PlatformAccessory<SmartHqContext>,
	) {
		this.accessory
			.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, accessory.context.device.brand)
			.setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.serial)
			.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.nickname);

		this.accessory.context.device.features.map(feature => {
			/* [
					'COOKING_V1_ACCENT_LIGHTING',
					'COOKING_V1_EXTENDED_COOKTOP_FOUNDATION',
					'COOKING_V1_MENU_TREE',
					'COOKING_V1_UPPER_OVEN_FOUNDATION',
					'COOKING_V2_CLOCK_DISPLAY',
					'COOKING_V2_UPPER_CAVITY_REMOTE_PRECISION_COOK',
				]; */

			switch (feature) {
				case 'COOKING_V1_UPPER_OVEN_FOUNDATION': {
					const ovenLight =
						this.accessory.getService('Upper Oven Light') ||
						this.accessory.addService(this.platform.Service.Lightbulb, 'Upper Oven Light', 'Oven');

					ovenLight
						.getCharacteristic(this.platform.Characteristic.On)
						.onGet(() => this.readErd(ERD_TYPES.UPPER_OVEN_LIGHT).then(r => parseInt(r) !== 0))
						.onSet((value: boolean) => this.writeErd(ERD_TYPES.UPPER_OVEN_LIGHT, value));
					return

					const ovenMode =
						this.accessory.getService('Upper Oven Mode') ||
						this.accessory
							.addService(this.platform.Service.StatefulProgrammableSwitch, 'Upper Oven Mode', 'Oven')
							.getCharacteristic(this.platform.Characteristic.TargetTemperature)
							.onGet(async () => {
								const erdVal = await this.readErd(ERD_TYPES.UPPER_OVEN_COOK_MODE);

								const b = Buffer.from(erdVal, 'hex');
								return fToC(b.readUint16BE(1));
							})
							.onSet(async (value: number) => {
								const fTarget = cToF(value);

								const erdVal = await this.readErd(ERD_TYPES.UPPER_OVEN_COOK_MODE);
								const b = Buffer.from(erdVal, 'hex');
								b.writeUint16BE(fTarget, 1);

								return this.writeErd(ERD_TYPES.UPPER_OVEN_COOK_MODE, b.toString('hex'));
							});
				}

				case 'COOKING_V1_ACCENT_LIGHTING': {
					return
					const service =
						this.accessory.getService('Accent Light') ||
						this.accessory.addService(this.platform.Service.Lightbulb, 'Accent Light', 'Stove');
				}
			}
		});
	}

	readErd(erd: string): Promise<string> {
		return axios
			.get(`/appliance/${this.accessory.context.device.applianceId}/erd/${erd}`)
			.then(d => String(d.data.value));
	}

	writeErd(erd: string, value: string | boolean) {
		return axios
			.post(`/appliance/${this.accessory.context.device.applianceId}/erd/${erd}`, {
				kind: 'appliance#erdListEntry',
				userId: this.accessory.context.userId,
				applianceId: this.accessory.context.device.applianceId,
				erd,
				value: typeof value === 'boolean' ? (value ? '01' : '00') : value,
			})
			.then(() => undefined);
	}
}

function cToF(celsius) {
	return (celsius * 9) / 5 + 32;
}

function fToC(fahrenheit) {
	return ((fahrenheit - 32) * 5) / 9;
}
