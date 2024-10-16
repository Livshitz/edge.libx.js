import { libx } from 'libx.js/build/bundles/essentials.js';

export class Module {
	public constructor(public options?: Partial<ModuleOptions>) {
		this.options = { ...new ModuleOptions(), ...options };
		libx.log.v('Module:ctor');
	}
	
}

export class ModuleOptions {

}