import { config } from '../../config.js';
import { logger } from '../../lib/log.js';
import type { SandboxConnector } from './types.js';
import { SimulatedConnector } from './simulated.js';
import { StaticConnector } from './static.js';

let instance: SandboxConnector | null = null;

/**
 * Connector factory. The default is the safe SimulatedConnector. To wire a real
 * detonation backend, implement SandboxConnector (e.g. CapeConnector) and add a
 * case here keyed on SANDBOX_CONNECTOR — no other code needs to change.
 */
export function getConnector(): SandboxConnector {
  if (instance) return instance;
  switch (config.connector) {
    case 'simulated':
      instance = new SimulatedConnector();
      break;
    case 'static':
      instance = new StaticConnector();
      break;
    // case 'cape':   instance = new CapeConnector(config); break;
    // case 'cuckoo': instance = new CuckooConnector(config); break;
    default:
      logger.warn('connector', 'unknown SANDBOX_CONNECTOR, falling back to simulated', { requested: config.connector });
      instance = new SimulatedConnector();
  }
  logger.info('connector', `using "${instance.name}"`);
  return instance;
}

export type { SandboxConnector } from './types.js';
