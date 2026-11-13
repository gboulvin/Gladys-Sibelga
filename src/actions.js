// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen (manifest
// `actions` field). Each handler is keyed by the action `key` and resolves the
// multi-language message displayed under its button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { t, truncate } from './i18n.js';
import { NETWORK_STATE, watchedOutages } from './devices/network.js';

const logger = createLogger({ name: 'actions' });

/** What the last read of the outage page showed, as a message. */
export function networkMessage(service) {
  if (service.network.state === NETWORK_STATE.DISABLED) {
    return t('action.network.disabled');
  }
  return (
    service.networkProblem() ??
    t('action.network.ok', {
      count: service.network.outages.length,
      watched: watchedOutages(service.network).length,
    })
  );
}

export const ACTIONS = {
  /** Sign in to the consumption portal and list the meters of the account. */
  async test_connection(service) {
    logger.info('Action test_connection');
    await service.refreshConsumption();
    const problem = service.consumptionProblem();
    if (problem) {
      return problem;
    }
    const meters = [...service.meters.values()].map(({ meter }) => meter.name);
    if (meters.length === 0) {
      return t('action.test.no_meter');
    }
    return truncate(t('action.test.ok', { count: meters.length, meters: meters.join(', ') }), 300);
  },

  /** Read the public outage page and say what it shows. */
  async test_network_status(service) {
    logger.info('Action test_network_status');
    await service.refreshNetwork();
    return networkMessage(service);
  },

  /** Read both sources now. */
  async refresh(service) {
    logger.info('Action refresh');
    await service.refreshAll();
    const problem = service.consumptionProblem() ?? service.networkProblem();
    if (problem) {
      // The other source may have worked: say which one did not.
      return Object.fromEntries(
        Object.entries(t('action.refresh.partial')).map(([language, text]) => [
          language,
          text.replace('{reason}', problem[language]),
        ]),
      );
    }
    return t('action.refresh.done', {
      meters: service.meters.size,
      outages: service.network.outages.length,
    });
  },
};
