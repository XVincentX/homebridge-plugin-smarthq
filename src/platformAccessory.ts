import type { PlatformAccessory } from 'homebridge';
import { compact } from 'lodash';
import { ERD_TYPES } from './constants';
import { SmartHQPlatform } from './platform';
import type { SmartHqContext } from './platform';

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

		compact(
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
					case 'COOKING_V1_UPPER_OVEN_FOUNDATION':
						const service =
							this.accessory.getService(`${accessory.context.device.nickname} Upper Oven Light`) ||
							this.accessory.addService(
								this.platform.Service.Lightbulb,
								`${accessory.context.device.nickname} Upper Oven Light`,
							);

						service
							.getCharacteristic(this.platform.Characteristic.On)
							.onGet(() =>
								accessory.context.axios
									.get(`/appliance/${accessory.context.device.applianceId}/erd/${ERD_TYPES.UPPER_OVEN_LIGHT}`)
									.then(r => parseInt(r.data.value) !== 0),
							)
							.onSet(value =>
								accessory.context.axios
									.post(`/appliance/${accessory.context.device.applianceId}/erd/${ERD_TYPES.UPPER_OVEN_LIGHT}`, {
										kind: 'appliance#erdListEntry',
										userId: accessory.context.userId,
										applianceId: accessory.context.device.applianceId,
										erd: ERD_TYPES.UPPER_OVEN_LIGHT,
										value: value ? '01' : '00',
									})
									.then(() => undefined),
							);

						return service;
				}
			}),
		);
	}
}
